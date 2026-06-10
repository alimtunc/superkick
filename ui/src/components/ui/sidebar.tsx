import {
	createContext,
	use,
	useCallback,
	useEffect,
	useMemo,
	useState,
	type ComponentProps,
	type CSSProperties
} from 'react'

import { Tooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { mergeProps } from '@base-ui/react/merge-props'
import { useRender } from '@base-ui/react/use-render'
import { PanelLeft } from 'lucide-react'

const SIDEBAR_COOKIE_NAME = 'sidebar_state'
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7
const SIDEBAR_WIDTH = '15rem'
const SIDEBAR_WIDTH_ICON = '3rem'

function readInitialOpen(): boolean {
	const entry = document.cookie.split('; ').find((part) => part.startsWith(`${SIDEBAR_COOKIE_NAME}=`))
	if (entry) return entry.slice(SIDEBAR_COOKIE_NAME.length + 1) === 'true'
	return true
}

interface SidebarContextValue {
	state: 'expanded' | 'collapsed'
	open: boolean
	setOpen: (open: boolean) => void
	toggleSidebar: () => void
}

const SidebarContext = createContext<SidebarContextValue | null>(null)

function useSidebar(): SidebarContextValue {
	const context = use(SidebarContext)
	if (!context) throw new Error('useSidebar must be used within a SidebarProvider')
	return context
}

function SidebarProvider({ className, style, children, ...props }: ComponentProps<'div'>) {
	const [open, setOpenState] = useState(readInitialOpen)

	const setOpen = useCallback((next: boolean) => {
		setOpenState(next)
		document.cookie = `${SIDEBAR_COOKIE_NAME}=${next}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`
	}, [])

	const toggleSidebar = useCallback(() => setOpen(!open), [setOpen, open])

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'b' && (event.metaKey || event.ctrlKey)) {
				event.preventDefault()
				toggleSidebar()
			}
		}
		window.addEventListener('keydown', handleKeyDown)
		return () => window.removeEventListener('keydown', handleKeyDown)
	}, [toggleSidebar])

	const contextValue = useMemo<SidebarContextValue>(
		() => ({ state: open ? 'expanded' : 'collapsed', open, setOpen, toggleSidebar }),
		[open, setOpen, toggleSidebar]
	)

	return (
		<SidebarContext.Provider value={contextValue}>
			<div
				data-sidebar="provider"
				style={
					{
						'--sidebar-width': SIDEBAR_WIDTH,
						'--sidebar-width-icon': SIDEBAR_WIDTH_ICON,
						...style
					} as CSSProperties
				}
				className={cn('flex h-full min-h-0 w-full', className)}
				{...props}
			>
				{children}
			</div>
		</SidebarContext.Provider>
	)
}

interface SidebarProps extends ComponentProps<'div'> {
	collapsible?: 'icon' | 'none'
}

function Sidebar({ collapsible = 'icon', className, children, ...props }: SidebarProps) {
	// Nullable on purpose: a collapsible="none" sidebar (settings) renders without a provider.
	const state = use(SidebarContext)?.state ?? 'expanded'

	if (collapsible === 'none') {
		return (
			<div
				data-sidebar="sidebar"
				className={cn(
					'flex h-full w-(--sidebar-width) flex-none flex-col border-r border-border bg-surface',
					className
				)}
				{...props}
			>
				{children}
			</div>
		)
	}

	return (
		<div
			data-sidebar="sidebar"
			data-state={state}
			data-collapsible={state === 'collapsed' ? 'icon' : undefined}
			className={cn(
				'group peer relative h-full w-(--sidebar-width) flex-none transition-[width] duration-200 ease-linear data-[state=collapsed]:w-(--sidebar-width-icon)',
				className
			)}
			{...props}
		>
			<div className="flex h-full w-full flex-col overflow-hidden border-r border-border bg-surface">
				{children}
			</div>
		</div>
	)
}

function SidebarTrigger({ className, onClick, ...props }: ComponentProps<'button'>) {
	const { toggleSidebar } = useSidebar()

	return (
		<button
			type="button"
			data-sidebar="trigger"
			aria-label="Toggle sidebar"
			title="Toggle sidebar"
			className={cn(
				'inline-flex size-7 flex-none items-center justify-center rounded-md text-fg-muted outline-none hover:bg-raised hover:text-fg focus-visible:ring-1 focus-visible:ring-border',
				className
			)}
			onClick={(event) => {
				onClick?.(event)
				toggleSidebar()
			}}
			{...props}
		>
			<PanelLeft size={16} />
		</button>
	)
}

function SidebarRail({ className, onClick, ...props }: ComponentProps<'button'>) {
	const { toggleSidebar } = useSidebar()

	return (
		<button
			type="button"
			data-sidebar="rail"
			aria-label="Toggle sidebar"
			title="Toggle sidebar"
			tabIndex={-1}
			className={cn(
				'absolute inset-y-0 -right-1 z-10 w-2 cursor-w-resize group-data-[state=collapsed]:cursor-e-resize after:absolute after:inset-y-0 after:left-1/2 after:w-0.5 after:-translate-x-1/2 after:transition-colors hover:after:bg-border',
				className
			)}
			onClick={(event) => {
				onClick?.(event)
				toggleSidebar()
			}}
			{...props}
		/>
	)
}

function SidebarHeader({ className, ...props }: ComponentProps<'div'>) {
	return <div data-sidebar="header" className={cn('flex flex-none flex-col p-2', className)} {...props} />
}

function SidebarContent({ className, ...props }: ComponentProps<'div'>) {
	return (
		<div
			data-sidebar="content"
			className={cn('flex min-h-0 flex-1 flex-col gap-2 overflow-auto', className)}
			{...props}
		/>
	)
}

function SidebarFooter({ className, ...props }: ComponentProps<'div'>) {
	return <div data-sidebar="footer" className={cn('flex flex-none flex-col p-2', className)} {...props} />
}

function SidebarGroup({ className, ...props }: ComponentProps<'div'>) {
	return (
		<div
			data-sidebar="group"
			className={cn('relative flex w-full min-w-0 flex-col p-2', className)}
			{...props}
		/>
	)
}

function SidebarGroupLabel({ className, ...props }: ComponentProps<'div'>) {
	return (
		<div
			data-sidebar="group-label"
			className={cn(
				'flex h-8 items-center px-2 text-[10.5px] tracking-wide text-fg-dim uppercase transition-[margin,opacity] duration-200 ease-linear group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0',
				className
			)}
			{...props}
		/>
	)
}

function SidebarGroupContent({ className, ...props }: ComponentProps<'div'>) {
	return <div data-sidebar="group-content" className={cn('w-full min-w-0', className)} {...props} />
}

function SidebarMenu({ className, ...props }: ComponentProps<'ul'>) {
	return (
		<ul data-sidebar="menu" className={cn('flex w-full min-w-0 flex-col gap-px', className)} {...props} />
	)
}

function SidebarMenuItem({ className, ...props }: ComponentProps<'li'>) {
	return <li data-sidebar="menu-item" className={cn('relative', className)} {...props} />
}

interface SidebarMenuButtonProps extends useRender.ComponentProps<'button'> {
	isActive?: boolean
	tooltip?: string
}

function SidebarMenuButton({
	isActive = false,
	tooltip,
	render,
	className,
	...props
}: SidebarMenuButtonProps) {
	const state = use(SidebarContext)?.state ?? 'expanded'

	const element = useRender({
		defaultTagName: 'button',
		render,
		props: mergeProps<'button'>(
			{
				className: cn(
					'flex w-full items-center gap-2 overflow-hidden rounded-md px-2 py-1.5 text-left text-[12.5px] text-fg-muted outline-none group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0 hover:bg-raised hover:text-fg focus-visible:ring-1 focus-visible:ring-border',
					isActive ? 'bg-raised font-medium text-fg' : null,
					className
				)
			},
			props
		),
		state: { sidebar: 'menu-button', active: isActive }
	})

	if (tooltip && state === 'collapsed') {
		return <Tooltip label={tooltip}>{element}</Tooltip>
	}
	return element
}

function SidebarMenuLabel({ className, ...props }: ComponentProps<'span'>) {
	return (
		<span
			data-sidebar="label"
			className={cn('truncate group-data-[collapsible=icon]:hidden', className)}
			{...props}
		/>
	)
}

function SidebarMenuBadge({ className, ...props }: ComponentProps<'span'>) {
	return (
		<span
			data-sidebar="menu-badge"
			className={cn(
				'ml-auto text-[10.5px] text-fg-dim tabular-nums group-data-[collapsible=icon]:hidden',
				className
			)}
			{...props}
		/>
	)
}

function SidebarInset({ className, ...props }: ComponentProps<'main'>) {
	return <main data-sidebar="inset" className={cn('flex min-w-0 flex-1 flex-col', className)} {...props} />
}

export {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarInset,
	SidebarMenu,
	SidebarMenuBadge,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuLabel,
	SidebarProvider,
	SidebarRail,
	SidebarTrigger
}
