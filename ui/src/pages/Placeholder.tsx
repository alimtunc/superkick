interface PlaceholderPageProps {
	title: string
	description: string
}

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
	return (
		<div className="flex flex-1 items-center justify-center p-10">
			<div className="text-center">
				<h1 className="font-data mb-2 text-sm tracking-wider text-silver uppercase">
					{title}
				</h1>
				<p className="text-[13px] text-dim">{description}</p>
			</div>
		</div>
	)
}
