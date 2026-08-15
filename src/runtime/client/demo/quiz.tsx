/**
 * A hand-written funnel in exactly the shape the compiler emits.
 *
 * No JSX and no imports inside the screen bodies — every module is a function of
 * `{ ui, c, t, state, nav }` calling `ui.Frame(props, children)`. That is
 * deliberate: a compiled module has no React in scope, so it cannot use JSX, and
 * a demo written any other way would be testing a contract the compiler does not
 * actually produce.
 *
 * It exercises what the design discussion argued through: single select with
 * auto-advance, multi-select with a cap and a `min` gate, appearance derived from
 * a comparison rather than toggled, an overlay, and a branch on an answer.
 */
import type { ScreenModule, ScreenProps } from "../funnel";
import type { VariableDecl } from "../../types";

export const variables: VariableDecl[] = [
  { name: "goal", type: "string" },
  { name: "equipment", type: "list<string>", min: 1, max: 3 },
];

export const locale: Record<string, string> = {
  "s_goal.title": "What's your goal?",
  "s_goal.o1": "Lose weight",
  "s_goal.o2": "Build muscle",
  "s_goal.o3": "Stay healthy",
  "s_gear.title": "What do you have at home?",
  "s_gear.hint": "Pick up to 3",
  "s_gear.o1": "Resistance bands",
  "s_gear.o2": "Yoga mat",
  "s_gear.o3": "Dumbbells",
  "s_gear.o4": "Kettlebell",
  "s_gear.o5": "Pull-up bar",
  "s_gear.cta": "Continue",
  "s_gear.why": "Why do you ask?",
  "d_why.title": "Why we ask",
  "d_why.body": "Your plan only includes exercises you can actually do at home.",
  "d_why.close": "Got it",
  "s_weights.title": "Strength plan",
  "s_weights.body": "You have weights, so your plan is built around progressive overload.",
  "s_bodyweight.title": "Bodyweight plan",
  "s_bodyweight.body": "No weights needed — your plan uses your own bodyweight.",
  "s_done.back": "Start over",
};

const PAGE = { minHeight: 520, maxWidth: 420, margin: "0 auto", fontFamily: "system-ui, sans-serif" };

/**
 * The Option design component: appearance is a variant bound to
 * `value in question`. It never hardcodes a value — it is handed one, and the
 * comparison happens per instance, which is what makes it correct for both
 * single and multi select.
 */
function option(
  { ui, state }: ScreenProps,
  question: string,
  value: string,
  label: string,
  onPick?: () => void,
) {
  const selected = state.has(question, value);
  const unavailable = !selected && state.atMax(question);

  return ui.Frame(
    {
      layout: "row",
      align: "center",
      justify: "between",
      padding: [16, 18],
      radius: 12,
      width: "fill",
      fill: selected ? "#eef2ff" : "#ffffff",
      border: selected ? "2px solid #2563eb" : "1px solid #e4e4e7",
      opacity: unavailable ? 0.45 : 1,
      disabled: unavailable,
      role: "radio",
      ariaChecked: selected,
      ariaLabel: label,
      testId: `option-${value}`,
      onClick: () => {
        state.select(question, value);
        onPick?.();
      },
    },
    [
      ui.Text({ size: 16, weight: selected ? 600 : 500, color: "#18181b" }, label),
      selected ? ui.Text({ size: 16, weight: 700, color: "#2563eb" }, "✓") : null,
    ],
  );
}

const shell = ({ ui }: ScreenProps, children: unknown[]) =>
  ui.Frame(
    { layout: "column", gap: 20, padding: 24, width: "fill", fill: "#fafafa", style: PAGE },
    children as never,
  );

/** Single select: picking an answer advances immediately. */
const GoalScreen: ScreenModule = (props) => {
  const { ui, t, state, nav } = props;
  return shell(props, [
    ui.Text({ size: 26, weight: 700, color: "#18181b", lineHeight: 32 }, t("s_goal.title")),
    ui.Frame({ layout: "column", gap: 12, role: "radiogroup", ariaLabel: t("s_goal.title") }, [
      option(props, "goal", "lose_weight", t("s_goal.o1"), () => nav.show("s_gear")),
      option(props, "goal", "build_muscle", t("s_goal.o2"), () => nav.show("s_gear")),
      option(props, "goal", "stay_healthy", t("s_goal.o3"), () => nav.show("s_gear")),
    ]),
    ui.Text({ size: 13, color: "#71717a" }, `goal = ${String(state.get("goal"))}`),
  ]);
};

/** Multi select: a cap, a `min` gate on Continue, and an overlay. */
const GearScreen: ScreenModule = (props) => {
  const { ui, t, state, nav } = props;
  const ready = state.meetsMin("equipment");

  return shell(props, [
    ui.Frame({ layout: "column", gap: 4 }, [
      ui.Text({ size: 26, weight: 700, color: "#18181b", lineHeight: 32 }, t("s_gear.title")),
      ui.Text({ size: 14, color: "#71717a" }, `${t("s_gear.hint")} · ${state.count("equipment")}/3`),
    ]),
    ui.Frame({ layout: "column", gap: 12, role: "group", ariaLabel: t("s_gear.title") }, [
      option(props, "equipment", "bands", t("s_gear.o1")),
      option(props, "equipment", "mat", t("s_gear.o2")),
      option(props, "equipment", "dumbbells", t("s_gear.o3")),
      option(props, "equipment", "kettlebell", t("s_gear.o4")),
      option(props, "equipment", "pullup_bar", t("s_gear.o5")),
    ]),
    ui.Frame(
      {
        layout: "row",
        align: "center",
        justify: "center",
        padding: [14, 20],
        radius: 12,
        width: "fill",
        fill: ready ? "#2563eb" : "#e4e4e7",
        disabled: !ready,
        role: "button",
        testId: "continue",
        onClick: () => {
          // The branch: an answer decides the next screen.
          if (state.has("equipment", "dumbbells") || state.has("equipment", "kettlebell")) {
            nav.show("s_weights");
          } else {
            nav.show("s_bodyweight");
          }
        },
      },
      ui.Text({ size: 16, weight: 600, color: ready ? "#ffffff" : "#a1a1aa" }, t("s_gear.cta")),
    ),
    ui.Frame(
      {
        role: "button",
        testId: "why",
        onClick: () => nav.show("d_why", { as: "overlay", position: "bottom" }),
      },
      ui.Text({ size: 14, weight: 500, color: "#2563eb", align: "center" }, t("s_gear.why")),
    ),
  ]);
};

/** An overlay — the same kind of frame, opened differently. */
const WhyOverlay: ScreenModule = ({ ui, t, nav }) =>
  ui.Frame(
    {
      layout: "column",
      gap: 12,
      padding: 24,
      fill: "#ffffff",
      width: "fill",
      style: { maxWidth: 420, margin: "0 auto", fontFamily: "system-ui, sans-serif" },
    },
    [
      ui.Text({ size: 20, weight: 700, color: "#18181b" }, t("d_why.title")),
      ui.Text({ size: 15, color: "#52525b", lineHeight: 22 }, t("d_why.body")),
      ui.Frame(
        {
          layout: "row",
          align: "center",
          justify: "center",
          padding: [12, 20],
          radius: 10,
          fill: "#18181b",
          role: "button",
          testId: "overlay-close",
          onClick: () => nav.close(),
        },
        ui.Text({ size: 15, weight: 600, color: "#ffffff" }, t("d_why.close")),
      ),
    ],
  );

const result =
  (titleKey: string, bodyKey: string): ScreenModule =>
  (props) => {
    const { ui, t, state, nav } = props;
    return shell(props, [
      ui.Text({ size: 26, weight: 700, color: "#18181b", lineHeight: 32 }, t(titleKey)),
      ui.Text({ size: 15, color: "#52525b", lineHeight: 22 }, t(bodyKey)),
      ui.Frame({ layout: "column", gap: 4, padding: 16, radius: 12, fill: "#ffffff", border: "1px solid #e4e4e7" }, [
        ui.Text({ size: 13, color: "#71717a" }, `goal = ${String(state.get("goal"))}`),
        ui.Text(
          { size: 13, color: "#71717a" },
          `equipment = [${(state.get("equipment") as string[]).join(", ")}]`,
        ),
      ]),
      ui.Frame(
        { role: "button", testId: "restart", onClick: () => nav.show("s_goal") },
        ui.Text({ size: 14, weight: 500, color: "#2563eb", align: "center" }, t("s_done.back")),
      ),
    ]);
  };

export const screens: Record<string, ScreenModule> = {
  s_goal: GoalScreen,
  s_gear: GearScreen,
  d_why: WhyOverlay,
  s_weights: result("s_weights.title", "s_weights.body"),
  s_bodyweight: result("s_bodyweight.title", "s_bodyweight.body"),
};

export const manifest = { entry: "s_goal", variables };
