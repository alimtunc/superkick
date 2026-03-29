# Frontend Conventions — Superkick

Source of truth for React 19 / TypeScript code in `ui/`.
Applies during implementation and review.

## React 19

- `forwardRef` is BANNED → ref is a standard prop
- `React.FC` / `React.FunctionComponent` are BANNED → use typed functions directly
- `JSX.Element` → use `ReactNode` for rendered props
- `defaultProps` is BANNED → use ES6 default values
- Prefer `use(MyContext)` over `useContext(MyContext)` for new components

## Clean Code

- Named exports only — no `export default`
- Conditional rendering: `condition ? <X /> : null`, NEVER `condition && <X />`
- Empty returns: `return null`, NEVER `return <></>`
- No unused imports
- No dead/commented code
- No `any` types — use precise types
- Components > 150 lines → split

## DRY / SOC

- Duplicated logic → extract into a hook or utility
- Business logic in components → must be in hooks
- No direct fetch — use separate API functions

## Tailwind v4

- No custom CSS classes if a Tailwind utility exists
- Consistent responsive design
