export type IconName =
  | "chevron"
  | "scene"
  | "section"
  | "book"
  | "people"
  | "place"
  | "front"
  | "research"
  | "trash"
  | "bold"
  | "italic"
  | "focus"
  | "binder"
  | "alignLeft"
  | "alignCenter"
  | "alignRight"
  | "alignJustify"
  | "bullet"
  | "numbered"
  | "underline"
  | "strike"
  | "superscript"
  | "subscript"
  | "indent"
  | "outdent";

type IconProps = {
  name: IconName;
};

export default function Icon({ name }: IconProps) {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      {mark(name)}
    </svg>
  );
}

function mark(name: IconName) {
  switch (name) {
    case "chevron":
      return <path d="M9 6.5 15 12l-6 5.5" />;
    case "scene":
      return (
        <>
          <path d="M7 4.5h7.2L18.5 9v10.2a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1z" />
          <path d="M14 4.6V9h4.4" />
        </>
      );
    case "section":
      return (
        <>
          <path d="M6 5.5h12.5v14H6z" />
          <path d="M9.5 5.5v14" />
        </>
      );
    case "book":
      return (
        <>
          <path d="M4.5 6.5c2.2-1 4.2-.6 7.5 0 3.3-.6 5.3-1 7.5 0V18c-2.2-1-4.2-.6-7.5 0-3.3-.6-5.3-1-7.5 0z" />
          <path d="M12 6.6V18" />
        </>
      );
    case "people":
      return (
        <>
          <circle cx="9" cy="8" r="2.1" />
          <circle cx="15.6" cy="9" r="1.7" />
          <path d="M4.8 18.2c.5-2.5 2.2-3.8 4.2-3.8s3.7 1.3 4.2 3.8" />
          <path d="M13.2 14.6c1.1-.4 2.2-.5 3.3-.1 1.4.5 2.3 1.6 2.7 3.5" />
        </>
      );
    case "place":
      return (
        <>
          <path d="M4 8.2 9 6l6 2.4 5-2.2V17l-5 2.4L9 17.2 4 19.2z" />
          <path d="M9 6v11.2M15 8.4V19.4" />
        </>
      );
    case "front":
      return (
        <>
          <path d="M6.5 4.5h11v15h-11z" />
          <path d="M9 9h6M9 12h4" />
        </>
      );
    case "research":
      return <path d="M7 4.5h10V20l-5-2.8L7 20z" />;
    case "trash":
      return (
        <>
          <path d="M5.5 8h13" />
          <path d="M9.5 8V5.8h5V8" />
          <path d="M7.2 8.2 8.2 19h7.6l1-10.8" />
        </>
      );
    case "bold":
      return (
        <text x="12" y="17" textAnchor="middle" className="icon-letter">
          B
        </text>
      );
    case "italic":
      return (
        <text x="12" y="17" textAnchor="middle" className="icon-letter icon-letter-italic">
          I
        </text>
      );
    case "focus":
      return (
        <>
          <path d="M4.5 9.5v-5h5M19.5 9.5v-5h-5M4.5 14.5v5h5M19.5 14.5v5h-5" />
        </>
      );
    case "binder":
      return (
        <>
          <path d="M4.5 5.5h5v13h-5z" />
          <path d="M12 5.5h7.5v13H12z" />
        </>
      );
    case "alignLeft":
      return (
        <>
          <path d="M5 7h14" />
          <path d="M5 12h9" />
          <path d="M5 17h12" />
        </>
      );
    case "alignCenter":
      return (
        <>
          <path d="M5 7h14" />
          <path d="M7.5 12h9" />
          <path d="M6 17h12" />
        </>
      );
    case "alignRight":
      return (
        <>
          <path d="M5 7h14" />
          <path d="M10 12h9" />
          <path d="M7 17h12" />
        </>
      );
    case "alignJustify":
      return (
        <>
          <path d="M5 7h14" />
          <path d="M5 12h14" />
          <path d="M5 17h14" />
        </>
      );
    case "bullet":
      return (
        <>
          <circle cx="6.5" cy="7" r="1" />
          <circle cx="6.5" cy="12" r="1" />
          <circle cx="6.5" cy="17" r="1" />
          <path d="M10 7h8" />
          <path d="M10 12h8" />
          <path d="M10 17h8" />
        </>
      );
    case "numbered":
      return (
        <>
          <text x="6.2" y="9" textAnchor="middle" className="icon-letter icon-index">
            1
          </text>
          <text x="6.2" y="14" textAnchor="middle" className="icon-letter icon-index">
            2
          </text>
          <text x="6.2" y="19" textAnchor="middle" className="icon-letter icon-index">
            3
          </text>
          <path d="M10 7h8" />
          <path d="M10 12h8" />
          <path d="M10 17h8" />
        </>
      );
    case "underline":
      return (
        <>
          <text x="12" y="16" textAnchor="middle" className="icon-letter">
            U
          </text>
          <path d="M7 19.5h10" />
        </>
      );
    case "strike":
      return (
        <>
          <text x="12" y="17" textAnchor="middle" className="icon-letter">
            S
          </text>
          <path d="M6 12h12" />
        </>
      );
    case "superscript":
      return (
        <>
          <text x="9" y="18" textAnchor="middle" className="icon-letter">
            x
          </text>
          <text x="16.5" y="11" textAnchor="middle" className="icon-letter icon-index">
            2
          </text>
        </>
      );
    case "subscript":
      return (
        <>
          <text x="9" y="15" textAnchor="middle" className="icon-letter">
            x
          </text>
          <text x="16.5" y="20" textAnchor="middle" className="icon-letter icon-index">
            2
          </text>
        </>
      );
    case "indent":
      return (
        <>
          <path d="M4.5 7h15" />
          <path d="M10 12h9.5" />
          <path d="M10 17h9.5" />
          <path d="M4.5 16.5 8 12 4.5 7.5" />
        </>
      );
    case "outdent":
      return (
        <>
          <path d="M4.5 7h15" />
          <path d="M4.5 12h9.5" />
          <path d="M4.5 17h9.5" />
          <path d="M19.5 7.5 16 12l3.5 4.5" />
        </>
      );
    default: {
      const unexpected: never = name;
      return unexpected;
    }
  }
}
