import { useForm } from "@tanstack/react-form";
import { answerInterrupt } from "@/api";
import type { InterruptAction } from "@/types";

export function useInterruptForm(runId: string, interruptId: string, onAnswered: () => void) {
  const form = useForm({
    defaultValues: { note: "" },
    onSubmit: async () => {
      // submission is handled per-action via submitAction
    },
  });

  const submitAction = async (action: InterruptAction) => {
    form.setErrorMap({ onSubmit: undefined });
    try {
      await answerInterrupt(runId, interruptId, action);
      form.reset();
      onAnswered();
    } catch (e) {
      form.setErrorMap({ onSubmit: { form: String(e), fields: {} } });
    }
  };

  const retry = () => submitAction({ action: "retry_step" });
  const abort = () => submitAction({ action: "abort_run" });
  const continueWithNote = () =>
    submitAction({ action: "continue_with_note", note: form.getFieldValue("note").trim() });

  return { form, retry, abort, continueWithNote };
}
