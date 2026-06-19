import type { ComponentType, SVGProps } from 'react'

import type { SKIconName } from '@/types/icons'
import {
	AlertCircle,
	AlertTriangle,
	ArrowRight,
	Bot,
	Check,
	CheckSquare,
	ChevronDown,
	ChevronRight,
	Clock,
	Command,
	Copy,
	Download,
	ExternalLink,
	FileText,
	Filter,
	Flag,
	Folder,
	GitBranch,
	GitFork,
	GitPullRequest,
	History,
	Inbox,
	Layers,
	Link as LinkIcon,
	MessageSquare,
	MoreHorizontal,
	Pause,
	Pin,
	Play,
	Plus,
	Repeat,
	Search,
	Send,
	Settings,
	Sparkles,
	Square,
	Star,
	Terminal,
	User,
	X,
	Zap
} from 'lucide-react'

type LucideIcon = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>

const BANK: Record<SKIconName, LucideIcon> = {
	inbox: Inbox,
	issue: AlertCircle,
	task: CheckSquare,
	agent: Bot,
	settings: Settings,
	search: Search,
	cmd: Command,
	play: Play,
	pause: Pause,
	stop: Square,
	check: Check,
	x: X,
	chev: ChevronRight,
	chevDown: ChevronDown,
	arrowRight: ArrowRight,
	external: ExternalLink,
	github: GitFork,
	branch: GitBranch,
	pr: GitPullRequest,
	comment: MessageSquare,
	doc: FileText,
	folder: Folder,
	zap: Zap,
	alert: AlertTriangle,
	clock: Clock,
	user: User,
	bot: Bot,
	filter: Filter,
	plus: Plus,
	more: MoreHorizontal,
	copy: Copy,
	link: LinkIcon,
	send: Send,
	download: Download,
	loop: Repeat,
	spark: Sparkles,
	terminal: Terminal,
	pin: Pin,
	star: Star,
	flag: Flag,
	history: History,
	layers: Layers
}

interface IconProps {
	name: SKIconName
	size?: number
	className?: string
	strokeWidth?: number
}

export function Icon({ name, size = 16, className, strokeWidth = 1.8 }: IconProps) {
	const Cmp = BANK[name]
	return <Cmp size={size} strokeWidth={strokeWidth} className={className} aria-hidden="true" />
}
