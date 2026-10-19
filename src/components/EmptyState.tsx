import type { ReactNode } from "react";

export interface EmptyStateProps {
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
  testId?: string;
}

export function EmptyState({ title, children, action, className, testId }: EmptyStateProps) {
  return (
    <div
      className={className ? `w6w-empty-state ${className}` : "w6w-empty-state"}
      data-testid={testId}
    >
      <div className="w6w-empty-state-inner">
        {title !== undefined && title !== null && (
          <div className="w6w-empty-state-title">{title}</div>
        )}
        {children !== undefined && children !== null && (
          <div className="w6w-empty-state-body">{children}</div>
        )}
        {action !== undefined && action !== null && (
          <div className="w6w-empty-state-action">{action}</div>
        )}
      </div>
    </div>
  );
}
