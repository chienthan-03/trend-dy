import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export const formatGenre = (genre: string) => genre.replace(/_/g, " ");

export const PageHeader = ({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) => (
  <header className="flex flex-wrap items-start justify-between gap-4">
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {description ? (
        <p className="mt-1 text-sm text-gray-600">{description}</p>
      ) : null}
    </div>
    {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
  </header>
);

export const Card = ({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) => (
  <section
    className={`rounded-lg border border-gray-200 bg-white p-4 shadow-sm ${className}`}
  >
    {title ? (
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
        {title}
      </h2>
    ) : null}
    {children}
  </section>
);

export const Button = ({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
}) => {
  const variants = {
    primary: "bg-gray-900 text-white hover:bg-gray-800",
    secondary: "border border-gray-300 bg-white text-gray-900 hover:bg-gray-50",
    danger: "bg-red-600 text-white hover:bg-red-700",
    ghost: "text-gray-700 hover:bg-gray-100",
  };

  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    />
  );
};

export const Input = ({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) => (
  <input
    className={`w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 ${className}`}
    {...props}
  />
);

export const Select = ({
  className = "",
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select
    className={`w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 ${className}`}
    {...props}
  >
    {children}
  </select>
);

export const Label = ({
  children,
  htmlFor,
}: {
  children: ReactNode;
  htmlFor?: string;
}) => (
  <label htmlFor={htmlFor} className="text-sm font-medium text-gray-700">
    {children}
  </label>
);

export const Alert = ({
  children,
  variant = "error",
}: {
  children: ReactNode;
  variant?: "error" | "info";
}) => (
  <p
    role="alert"
    className={
      variant === "error"
        ? "rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        : "rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800"
    }
  >
    {children}
  </p>
);

export const EmptyState = ({ children }: { children: ReactNode }) => (
  <p className="text-sm text-gray-500">{children}</p>
);

export const Badge = ({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger";
}) => {
  const tones = {
    neutral: "bg-gray-100 text-gray-700",
    success: "bg-green-100 text-green-800",
    warning: "bg-amber-100 text-amber-800",
    danger: "bg-red-100 text-red-800",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
};

export const TierBadge = ({ tier }: { tier: string | null }) => {
  if (!tier) return <Badge>—</Badge>;
  const tone =
    tier === "S" ? "success" : tier === "A" ? "warning" : "neutral";
  return <Badge tone={tone}>{tier}</Badge>;
};

export const StatusBadge = ({ status }: { status: string }) => {
  const tone =
    status === "completed" || status === "approved" || status === "ready"
      ? "success"
      : status === "failed" || status === "rejected"
        ? "danger"
        : status === "active" || status === "running" || status === "queued"
          ? "warning"
          : "neutral";
  return <Badge tone={tone}>{status}</Badge>;
};
