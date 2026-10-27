import type { MouseEvent, ReactNode } from "react";

export type NavState = "notyetanswered" | "answersaved" | "correct" | "incorrect";
export interface NavButton {
  number: number;
  state: NavState;
  thispage: boolean;
  flagged: boolean;
  href: string;
  onClick?: (e: MouseEvent) => void;
}
export interface NavLinkItem { label: string; href: string; onClick?: (e: MouseEvent) => void }

const STATE_TEXT: Record<NavState, string> = {
  notyetanswered: "Not yet answered",
  answersaved: "Answer saved",
  correct: "Correct",
  incorrect: "Incorrect",
};

/** Moodle's "Quiz navigation" block: numbered buttons + links under them. */
export function NavBlock({ buttons, links, allOnOnePage = false, children }: {
  buttons: NavButton[];
  links: NavLinkItem[];
  allOnOnePage?: boolean;
  children?: ReactNode;
}) {
  return (
    <section id="mod_quiz_navblock" className="block card" role="navigation" aria-labelledby="mod_quiz_navblock_title">
      <div className="card-body">
        <h5 id="mod_quiz_navblock_title" className="card-title">Quiz navigation</h5>
        <div className="card-text content mt-3">
          <div className={`qn_buttons clearfix ${allOnOnePage ? "allquestionsononepage" : "multipages"}`}>
            {buttons.map((b) => (
              <a
                key={b.number}
                id={`quiznavbutton${b.number}`}
                href={b.href}
                onClick={b.onClick}
                className={`qnbutton ${b.state} free${b.thispage ? " thispage" : ""}${b.flagged ? " flagged" : ""}`}
              >
                <span className="thispageholder" />
                <span className="trafficlight" />
                <span className="accesshide">Question </span>
                {b.number}
                <span className="accesshide">
                  {b.thispage ? " This page" : ""} {STATE_TEXT[b.state]}
                  {b.flagged ? " Flagged" : ""}
                </span>
              </a>
            ))}
          </div>
          <div className="othernav">
            {links.map((l) => (
              <a key={l.label} href={l.href} onClick={l.onClick} className="endtestlink aalink">{l.label}</a>
            ))}
          </div>
          {children}
        </div>
      </div>
    </section>
  );
}
