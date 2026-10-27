import type { QuestionType } from "@/lib/grading";
import type { QuestionImage } from "@/lib/services/attempts";
import { CheckIcon, CrossIcon, FlagIcon } from "../Icons";

export type Verdict = "correct" | "incorrect" | "notanswered";

export interface BlockOption {
  id: string;
  html: string;
  selected: boolean;
  /** review only: tick / cross next to a selected option */
  icon?: "correct" | "incorrect" | null;
}
export interface BlockReview {
  verdict: Verdict;
  rightAnswerHtml?: string[] | null;
  explanationHtml?: string | null;
}
export interface QuestionBlockProps {
  number: number;
  type: QuestionType;
  html: string;
  image: QuestionImage | null;
  options: BlockOption[];
  numbering: string;
  flagged: boolean;
  answered: boolean;
  review?: BlockReview;
  onSelect?: (optionId: string, checked: boolean) => void;
  onClear?: () => void;
  onToggleFlag?: () => void;
}

/** "a. ", "A. ", "1. " - the answer numbering style Moodle lets you pick per question. */
export function optionPrefix(i: number, style: string): string {
  if (style === "ABCD") return `${String.fromCharCode(65 + (i % 26))}. `;
  if (style === "123") return `${i + 1}. `;
  if (style === "none") return "";
  return `${String.fromCharCode(97 + (i % 26))}. `;
}

const VERDICT_TEXT: Record<Verdict, string> = { correct: "Correct", incorrect: "Incorrect", notanswered: "Not answered" };

/** One question, laid out exactly like Moodle's `.que` block (info box on the left, formulation on the right). */
export function QuestionBlock(p: QuestionBlockProps) {
  const review = p.review;
  const single = p.type === "single_choice";
  const stateClass = review ? review.verdict : p.answered ? "answersaved" : "notyetanswered";
  const hasSelection = p.options.some((o) => o.selected);

  return (
    <div id={`question-${p.number}`} className={`que multichoice deferredfeedback ${stateClass}`}>
      <div className="info">
        <h3 className="no">Question <span className="qno">{p.number}</span></h3>
        <div className="state">{review ? VERDICT_TEXT[review.verdict] : p.answered ? "Answer saved" : "Not yet answered"}</div>
        <div className="grade">
          {review ? `Mark ${review.verdict === "correct" ? "1.00" : "0.00"} out of 1.00` : "Marked out of 1.00"}
        </div>
        {review ? (
          p.flagged && (
            <div className="questionflag on"><span style={{ display: "inline-flex" }}><FlagIcon on /> Flagged</span></div>
          )
        ) : (
          <div className={`questionflag editable${p.flagged ? " on" : ""}`}>
            <button type="button" onClick={p.onToggleFlag} aria-pressed={p.flagged}>
              <FlagIcon on={p.flagged} />
              <span>{p.flagged ? "Remove flag" : "Flag question"}</span>
            </button>
          </div>
        )}
      </div>

      <div className="content">
        <div className="formulation clearfix">
          <h4 className="accesshide">Question text</h4>
          <div className="qtext">
            <div dangerouslySetInnerHTML={{ __html: p.html }} />
            {p.image && (
              <div className="qimage">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.image.url} alt={p.image.alt ?? ""} />
              </div>
            )}
          </div>
          <div className="ablock">
            <div className="prompt">{single ? "Select one:" : "Select one or more:"}</div>
            <div className="answer" role={single ? "radiogroup" : "group"}>
              {p.options.map((o, i) => {
                const id = `q${p.number}-a${i}`;
                return (
                  <div key={o.id} className={`r${i % 2}${o.icon ? ` ${o.icon}` : ""}`}>
                    <input
                      type={single ? "radio" : "checkbox"}
                      name={`q${p.number}`}
                      id={id}
                      value={o.id}
                      checked={o.selected}
                      disabled={!!review}
                      onChange={review ? undefined : (e) => p.onSelect?.(o.id, e.target.checked)}
                    />
                    <div className="d-flex w-auto">
                      <label htmlFor={id}>
                        <span className="answernumber">{optionPrefix(i, p.numbering)}</span>
                        <span className="flex-fill option-text" dangerouslySetInnerHTML={{ __html: o.html }} />
                      </label>
                    </div>
                    {o.icon && <span className="feedbackicon">{o.icon === "correct" ? <CheckIcon /> : <CrossIcon />}</span>}
                  </div>
                );
              })}
            </div>
            {!review && single && hasSelection && (
              <div className="clearchoice">
                <button type="button" className="btn btn-link" onClick={p.onClear}>Clear my choice</button>
              </div>
            )}
          </div>
        </div>

        {review && (
          <div className="outcome clearfix">
            <div className="feedback">
              <div className="specificfeedback">
                {review.verdict === "correct" ? "Your answer is correct." : "Your answer is incorrect."}
              </div>
              {review.rightAnswerHtml && review.rightAnswerHtml.length > 0 && (
                <div className="rightanswer">
                  {review.rightAnswerHtml.length === 1 ? "The correct answer is: " : "The correct answers are: "}
                  {review.rightAnswerHtml.map((h, i) => (
                    <span key={i}>
                      {i > 0 && ", "}
                      <span dangerouslySetInnerHTML={{ __html: h }} />
                    </span>
                  ))}
                </div>
              )}
              {review.explanationHtml && <div className="generalfeedback" dangerouslySetInnerHTML={{ __html: review.explanationHtml }} />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
