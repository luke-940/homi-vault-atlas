import type { ReactNode } from "react";

export function WorkspaceTitle({
  workspace,
  context,
  actions,
}: {
  workspace: string;
  context: string;
  actions?: ReactNode;
}) {
  return (
    <header className="workspace-heading">
      <div className="workspace-heading__identity">
        <h1 className="visually-hidden">{workspace} · {context}</h1>
        <strong>{workspace}</strong>
        <span aria-hidden="true">/</span>
        <p>{context}</p>
      </div>
      {actions ? <div className="workspace-heading__actions">{actions}</div> : null}
    </header>
  );
}
