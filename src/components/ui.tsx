export function Alert({ kind = "info", children }: { kind?: "info" | "success" | "warning" | "danger"; children: React.ReactNode }) {
  return <div className={`alert alert-${kind}`} role={kind === "danger" ? "alert" : "status"}>{children}</div>;
}
