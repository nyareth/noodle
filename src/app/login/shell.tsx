import { LoginForm } from "@/components/AuthForms";
import { MoodleShell } from "@/components/MoodleShell";

export function AuthShellLogin({ next, canRegister }: { next?: string; canRegister: boolean }) {
  return (
    <MoodleShell user={null} title="Log in" bare>
      <LoginForm next={next} canRegister={canRegister} />
    </MoodleShell>
  );
}
