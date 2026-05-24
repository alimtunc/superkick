#!/usr/bin/env node
/* oxlint-disable no-await-in-loop -- screenshots and UI actions must run sequentially for deterministic fixture state. */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { chromium } from '@playwright/test'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'
import { createServer } from 'vite'

import { responseForFixture } from './fixtures.mjs'
import {
	CAPTURE_STATES,
	DEFAULT_OUTPUT_DIR,
	DIFF_THRESHOLD,
	PIXELMATCH_THRESHOLD,
	findStates
} from './manifest.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const uiRoot = path.resolve(__dirname, '..')
const repoRoot = path.resolve(uiRoot, '..')

const args = parseArgs(process.argv.slice(2))
if (args.list) {
	for (const state of CAPTURE_STATES) {
		console.log(`${state.id}\t${state.label}`)
	}
	process.exit(0)
}

const rootOutputDir = path.resolve(uiRoot, args.output ?? DEFAULT_OUTPUT_DIR)
const states = findStates(args.states)
let activeFixture = null

await fs.rm(rootOutputDir, { recursive: true, force: true })
await fs.mkdir(rootOutputDir, { recursive: true })

const server = await createServer({
	root: uiRoot,
	plugins: [visualParityApiPlugin(() => activeFixture)],
	server: { host: '127.0.0.1', port: args.port, strictPort: Boolean(args.port) },
	logLevel: 'warn'
})

let activeBrowser
try {
	await server.listen()
	const baseUrl = server.resolvedUrls?.local[0]
	if (!baseUrl) throw new Error('Vite did not expose a local URL')

	activeBrowser = await chromium.launch()
	const results = []
	for (const state of states) {
		results.push(await captureState({ state, baseUrl, browser: activeBrowser, outputDir: rootOutputDir }))
	}
	await writeSummary(rootOutputDir, results)
	console.log(`Visual parity output: ${path.relative(repoRoot, rootOutputDir)}`)
	console.log(`Summary: ${path.relative(repoRoot, path.join(rootOutputDir, 'summary.md'))}`)
} finally {
	if (activeBrowser) await activeBrowser.close()
	await server.close()
}

async function captureState({ state, baseUrl, browser, outputDir }) {
	const stateDir = path.join(outputDir, state.id)
	await fs.mkdir(stateDir, { recursive: true })

	const mockupPath = path.join(stateDir, 'mockup.png')
	const appPath = path.join(stateDir, 'app.png')
	const diffPath = path.join(stateDir, 'diff.png')
	const notesPath = path.join(stateDir, 'notes.md')

	await captureMockup({ browser, state, outputPath: mockupPath })
	await captureApp({ browser, state, baseUrl, outputPath: appPath })
	const diff = await diffScreenshots(mockupPath, appPath, diffPath)
	await writeNotes({ state, notesPath, mockupPath, appPath, diffPath, diff })

	return { state, mockupPath, appPath, diffPath, notesPath, diff }
}

async function captureMockup({ browser, state, outputPath }) {
	const context = await browser.newContext({
		viewport: {
			width: Math.max(1440, state.viewport.width),
			height: Math.max(1100, state.viewport.height)
		},
		deviceScaleFactor: 1,
		colorScheme: 'dark',
		reducedMotion: 'reduce',
		locale: 'en-US',
		timezoneId: 'UTC'
	})
	const page = await context.newPage()
	const artifactPath = path.resolve(uiRoot, state.mockup.file)
	const target = await resolveArtboardTarget(artifactPath, state.mockup.artboardId)
	await page.goto(pathToFileURL(artifactPath).toString(), { waitUntil: 'domcontentloaded' })
	const label = page.locator('span.dc-editable', { hasText: target.label }).nth(target.labelIndex)
	await label.waitFor({ state: 'visible', timeout: 20_000 })
	await page.waitForTimeout(500)
	const artboardHandle = await label.evaluateHandle((element) => {
		const header = element.closest('.dc-header')
		return header?.nextElementSibling ?? null
	})
	const artboard = artboardHandle.asElement()
	if (!artboard) throw new Error(`Could not resolve rendered artboard for ${state.mockup.artboardId}`)
	await artboard.screenshot({ path: outputPath, animations: 'disabled' })
	await context.close()
}

async function resolveArtboardTarget(artifactPath, artboardId) {
	const source = await fs.readFile(artifactPath, 'utf8')
	const artboards = [...source.matchAll(/<DCArtboard id=\\?"([^"\\]+)\\?" label=\\?"([^"\\]+)\\?"/g)].map(
		(match) => ({ id: decodeHtml(match[1]), label: decodeHtml(match[2]) })
	)
	const targetIndex = artboards.findIndex((artboard) => artboard.id === artboardId)
	if (targetIndex === -1) throw new Error(`Artboard "${artboardId}" not found in ${artifactPath}`)
	const target = artboards[targetIndex]
	const labelIndex = artboards
		.slice(0, targetIndex)
		.filter((artboard) => artboard.label === target.label).length
	return { label: target.label, labelIndex }
}

function decodeHtml(value) {
	return value
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
}

async function captureApp({ browser, state, baseUrl, outputPath }) {
	activeFixture = state.fixture
	const context = await browser.newContext({
		viewport: state.viewport,
		deviceScaleFactor: 1,
		colorScheme: 'dark',
		reducedMotion: 'reduce',
		locale: 'en-US',
		timezoneId: 'UTC'
	})
	await context.addInitScript(() => {
		const fixedNow = new Date('2026-05-24T14:00:00.000Z').valueOf()
		Date.now = () => fixedNow
		window.localStorage.clear()
	})
	await context.addInitScript((stateId) => {
		window.__SUPERKICK_VISUAL_PARITY_STATE__ = stateId
	}, state.id)
	const page = await context.newPage()
	const diagnostics = collectDiagnostics(page)
	try {
		await page.goto(new URL(state.route, baseUrl).toString(), { waitUntil: 'domcontentloaded' })
		await waitForState(page, state)
		await runActions(page, state.actions ?? [])
		await page.waitForTimeout(350)
		if (state.capture?.type === 'dialog') {
			await page.getByRole('dialog', { name: state.capture.name }).screenshot({
				path: outputPath,
				animations: 'disabled'
			})
		} else {
			await page.screenshot({ path: outputPath, fullPage: true, animations: 'disabled' })
		}
	} catch (error) {
		await writeDebugArtifacts(page, outputPath, diagnostics)
		throw error
	} finally {
		await context.close()
		activeFixture = null
	}
}

function collectDiagnostics(page) {
	const messages = []
	page.on('console', (message) => {
		if (message.type() === 'error' || message.type() === 'warning') {
			messages.push(`[console:${message.type()}] ${message.text()}`)
		}
	})
	page.on('requestfailed', (request) => {
		messages.push(`[requestfailed] ${request.url()} ${request.failure()?.errorText ?? ''}`)
	})
	page.on('response', (response) => {
		if (response.status() >= 400) messages.push(`[response:${response.status()}] ${response.url()}`)
	})
	return messages
}

async function writeDebugArtifacts(page, outputPath, diagnostics) {
	const dir = path.dirname(outputPath)
	await fs.mkdir(dir, { recursive: true })
	await page.screenshot({ path: path.join(dir, 'app-debug.png'), fullPage: true }).catch(() => {})
	await fs.writeFile(path.join(dir, 'app-debug.html'), await page.content()).catch(() => {})
	await fs.writeFile(path.join(dir, 'diagnostics.txt'), diagnostics.join('\n')).catch(() => {})
}

function visualParityApiPlugin(getFixtureName) {
	return {
		name: 'superkick-visual-parity-api',
		configureServer(viteServer) {
			viteServer.middlewares.use('/api', (request, response, next) => {
				const fixtureName = getFixtureName()
				if (!fixtureName || !request.url) {
					next()
					return
				}
				const requestUrl = new URL(`/api${request.url}`, 'http://visual-parity.local').toString()
				const fixture = responseForFixture(fixtureName, requestUrl)
				if (!fixture) {
					response.statusCode = 404
					response.setHeader('Content-Type', 'application/json')
					response.end(JSON.stringify({ error: `No visual fixture for ${request.url}` }))
					return
				}
				if (typeof fixture === 'object' && 'body' in fixture && 'contentType' in fixture) {
					response.statusCode = 200
					response.setHeader('Content-Type', fixture.contentType)
					response.end(fixture.body)
					return
				}
				if (typeof fixture === 'string') {
					response.statusCode = 200
					response.setHeader('Content-Type', 'text/plain')
					response.end(fixture)
					return
				}
				response.statusCode = 200
				response.setHeader('Content-Type', 'application/json')
				response.end(JSON.stringify(fixture))
			})
		}
	}
}

async function waitForState(page, state) {
	if (state.waitFor) {
		await page.locator(state.waitFor).first().waitFor({ state: 'visible', timeout: 15_000 })
		return
	}
	if (state.waitForText) {
		await page.getByText(state.waitForText, { exact: false }).first().waitFor({ timeout: 15_000 })
	}
}

async function runActions(page, actions) {
	for (const action of actions) {
		switch (action.type) {
			case 'hoverIssue':
				await page.locator(`[data-issue-row][data-identifier="${action.identifier}"]`).hover()
				await page.waitForTimeout(500)
				break
			case 'clickRole':
				await page.getByRole(action.role, { name: action.name }).click()
				await page.waitForTimeout(250)
				break
			case 'openRunDrawer':
				await page.getByRole('button', { name: /Open (active|latest) run drawer/ }).click()
				await page.getByRole('dialog', { name: 'Run' }).waitFor({ timeout: 10_000 })
				break
			case 'dragIssueToState':
				await dragIssueToState(page, action)
				break
			default:
				throw new Error(`Unknown visual action "${action.type}"`)
		}
	}
}

async function dragIssueToState(page, action) {
	const source = page.getByLabel(new RegExp(`^${escapeRegExp(action.identifier)} — drag to move`))
	const target = page.locator(`[data-issue-state="${action.state}"]`)
	await source.waitFor({ state: 'visible', timeout: 10_000 })
	await target.waitFor({ state: 'visible', timeout: 10_000 })

	const sourceBox = await source.boundingBox()
	const targetBox = await target.boundingBox()
	if (!sourceBox || !targetBox) {
		throw new Error(`Could not resolve drag geometry for ${action.identifier}`)
	}

	await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2)
	await page.mouse.down()
	await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + 96, { steps: 12 })
	await page.waitForTimeout(350)
}

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function diffScreenshots(mockupPath, appPath, diffPath) {
	const [mockupBuffer, appBuffer] = await Promise.all([fs.readFile(mockupPath), fs.readFile(appPath)])
	const mockup = PNG.sync.read(mockupBuffer)
	const app = PNG.sync.read(appBuffer)
	if (mockup.width !== app.width || mockup.height !== app.height) {
		return {
			status: 'manual',
			reason: `dimension mismatch: mockup ${mockup.width}x${mockup.height}, app ${app.width}x${app.height}`
		}
	}

	const diff = new PNG({ width: mockup.width, height: mockup.height })
	const mismatched = pixelmatch(mockup.data, app.data, diff.data, mockup.width, mockup.height, {
		threshold: PIXELMATCH_THRESHOLD
	})
	await fs.writeFile(diffPath, PNG.sync.write(diff))
	const total = mockup.width * mockup.height
	const ratio = mismatched / total
	return {
		status: ratio <= DIFF_THRESHOLD ? 'pass' : 'review',
		mismatched,
		total,
		ratio
	}
}

async function writeNotes({ state, notesPath, mockupPath, appPath, diffPath, diff }) {
	const diffLine =
		diff.status === 'manual'
			? `Manual review required: ${diff.reason}`
			: `${formatPercent(diff.ratio)} changed pixels (${diff.mismatched}/${diff.total}); threshold ${formatPercent(DIFF_THRESHOLD)}`
	const lines = [
		`# ${state.id}`,
		'',
		`Label: ${state.label}`,
		`Route: \`${state.route}\``,
		`Mockup artboard: \`${state.mockup.artboardId}\``,
		`Status: ${diff.status}`,
		`Diff: ${diffLine}`,
		'',
		'Artifacts:',
		`- Mockup: \`${path.basename(mockupPath)}\``,
		`- App: \`${path.basename(appPath)}\``,
		diff.status === 'manual' ? '- Diff: not generated' : `- Diff: \`${path.basename(diffPath)}\``,
		''
	]
	await fs.writeFile(notesPath, lines.join('\n'))
}

async function writeSummary(root, results) {
	const lines = [
		'# Issue-centered V1 Visual Parity Capture',
		'',
		`Generated: ${new Date().toISOString()}`,
		'',
		'Manual acceptance rule: a state passes when either the pixel diff is at or below the configured threshold, or reviewers attach the generated screenshots and explain every intentional mismatch in the PR notes.',
		'',
		'| State | Route | Mockup | App | Diff | Status |',
		'|---|---|---|---|---|---|'
	]
	for (const result of results) {
		const stateDir = result.state.id
		const diffCell = result.diff.status === 'manual' ? 'manual' : `[diff](${stateDir}/diff.png)`
		const status =
			result.diff.status === 'manual'
				? result.diff.reason
				: `${result.diff.status} (${formatPercent(result.diff.ratio)})`
		lines.push(
			`| ${result.state.id} | \`${result.state.route}\` | [mockup](${stateDir}/mockup.png) | [app](${stateDir}/app.png) | ${diffCell} | ${status} |`
		)
	}
	lines.push('')
	await fs.writeFile(path.join(root, 'summary.md'), lines.join('\n'))
}

function parseArgs(argv) {
	const parsed = { states: [], output: null, port: undefined, list: false }
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index]
		if (arg === '--') continue
		if (arg === '--list') {
			parsed.list = true
			continue
		}
		if (arg === '--states') {
			parsed.states = splitList(argv[++index] ?? '')
			continue
		}
		if (arg.startsWith('--states=')) {
			parsed.states = splitList(arg.slice('--states='.length))
			continue
		}
		if (arg === '--output') {
			parsed.output = argv[++index] ?? null
			continue
		}
		if (arg.startsWith('--output=')) {
			parsed.output = arg.slice('--output='.length)
			continue
		}
		if (arg === '--port') {
			parsed.port = Number(argv[++index])
			continue
		}
		if (arg.startsWith('--port=')) {
			parsed.port = Number(arg.slice('--port='.length))
			continue
		}
		throw new Error(`Unknown argument "${arg}"`)
	}
	return parsed
}

function splitList(value) {
	return value
		.split(',')
		.map((item) => item.trim())
		.filter(Boolean)
}

function formatPercent(value) {
	return `${(value * 100).toFixed(2)}%`
}
