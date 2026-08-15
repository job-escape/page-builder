/**
 * A hand-written funnel, in exactly the shape the compiler will emit.
 *
 * Screen modules are plain functions of `{ ui, t, state, nav }` with no imports
 * — everything they touch is passed in. So this is a faithful stand-in for
 * compiled output, and building it before the compiler exists is what proves the
 * runtime contract is usable rather than merely designed.
 *
 * It exercises the cases that were argued through in `docs/funnel-as-code.md`:
 * single select with auto-advance, multi-select with a cap and a `min` gate, an
 * option whose appearance is a variant bound to a comparison, an overlay, and a
 * branch on an answer.
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

/**
 * The Option "design component": a frame whose appearance is a variant bound to
 * `value in question`. It never hardcodes a value — it is handed one, and the
 * comparison happens per instance. That is what makes the same component correct
 * for single and multi select.
 */
function Option({
  ui,
  state,
  question,
  value,
  label,
  onPick,
}: ScreenProps & { question: string; value: string; label: string; onPick?: () => void }) {
  const selected = state.has(question, value);
  const unavailable = !selected && state.atMax(question);

  return (
    <ui.Frame
      layout="row"
      align="center"
      justify="between"
      padding={[16, 18]}
      radius={12}
      width="fill"
      fill={selected ? "#eef2ff" : "#ffffff"}
      border={selected ? "2px solid #2563eb" : "1px solid #e4e4e7"}
      opacity={unavailable ? 0.45 : 1}
      disabled={unavailable}
      role="radio"
      ariaChecked={selected}
      ariaLabel={label}
      testId={`option-${value}`}
      onClick={() => {
        state.select(question, value);
        onPick?.();
      }}
    >
      <ui.Text size={16} weight={selected ? 600 : 500} color="#18181b">
        {label}
      </ui.Text>
      {selected ? (
        <ui.Text size={16} weight={700} color="#2563eb">
          ✓
        </ui.Text>
      ) : null}
    </ui.Frame>
  );
}

function Shell({ ui, children }: ScreenProps & { children: React.ReactNode }) {
  return (
    <ui.Frame
      layout="column"
      gap={20}
      padding={24}
      width="fill"
      fill="#fafafa"
      style={{ minHeight: 520, maxWidth: 420, margin: "0 auto", fontFamily: "system-ui, sans-serif" }}
    >
      {children}
    </ui.Frame>
  );
}

/** Single select: picking an answer advances immediately. */
const GoalScreen: ScreenModule = (props) => {
  const { ui, t, state, nav } = props;
  return (
    <Shell {...props}>
      <ui.Text size={26} weight={700} color="#18181b" lineHeight={32}>
        {t("s_goal.title")}
      </ui.Text>
      <ui.Frame layout="column" gap={12} role="radiogroup" ariaLabel={t("s_goal.title")}>
        {[
          ["lose_weight", "s_goal.o1"],
          ["build_muscle", "s_goal.o2"],
          ["stay_healthy", "s_goal.o3"],
        ].map(([value, key]) => (
          <Option
            key={value}
            {...props}
            question="goal"
            value={value}
            label={t(key)}
            onPick={() => nav.show("s_gear")}
          />
        ))}
      </ui.Frame>
      <ui.Text size={13} color="#71717a">
        goal = {String(state.get("goal"))}
      </ui.Text>
    </Shell>
  );
};

/** Multi select: a cap, a `min` gate on Continue, and an overlay. */
const GearScreen: ScreenModule = (props) => {
  const { ui, t, state, nav } = props;
  const ready = state.meetsMin("equipment");

  return (
    <Shell {...props}>
      <ui.Frame layout="column" gap={4}>
        <ui.Text size={26} weight={700} color="#18181b" lineHeight={32}>
          {t("s_gear.title")}
        </ui.Text>
        <ui.Text size={14} color="#71717a">
          {t("s_gear.hint")} · {state.count("equipment")}/3
        </ui.Text>
      </ui.Frame>

      <ui.Frame layout="column" gap={12} role="group" ariaLabel={t("s_gear.title")}>
        {[
          ["bands", "s_gear.o1"],
          ["mat", "s_gear.o2"],
          ["dumbbells", "s_gear.o3"],
          ["kettlebell", "s_gear.o4"],
          ["pullup_bar", "s_gear.o5"],
        ].map(([value, key]) => (
          <Option key={value} {...props} question="equipment" value={value} label={t(key)} />
        ))}
      </ui.Frame>

      <ui.Frame
        padding={[14, 20]}
        radius={12}
        width="fill"
        align="center"
        justify="center"
        layout="row"
        fill={ready ? "#2563eb" : "#e4e4e7"}
        disabled={!ready}
        role="button"
        testId="continue"
        onClick={() => {
          // The branch: an answer decides the next screen.
          if (state.has("equipment", "dumbbells") || state.has("equipment", "kettlebell")) {
            nav.show("s_weights");
          } else {
            nav.show("s_bodyweight");
          }
        }}
      >
        <ui.Text size={16} weight={600} color={ready ? "#ffffff" : "#a1a1aa"}>
          {t("s_gear.cta")}
        </ui.Text>
      </ui.Frame>

      <ui.Frame
        role="button"
        testId="why"
        onClick={() => nav.show("d_why", { as: "overlay", position: "bottom" })}
      >
        <ui.Text size={14} weight={500} color="#2563eb" align="center">
          {t("s_gear.why")}
        </ui.Text>
      </ui.Frame>
    </Shell>
  );
};

/** An overlay — the same kind of frame, opened differently. */
const WhyOverlay: ScreenModule = (props) => {
  const { ui, t, nav } = props;
  return (
    <ui.Frame
      layout="column"
      gap={12}
      padding={24}
      fill="#ffffff"
      width="fill"
      style={{ maxWidth: 420, margin: "0 auto", fontFamily: "system-ui, sans-serif" }}
    >
      <ui.Text size={20} weight={700} color="#18181b">
        {t("d_why.title")}
      </ui.Text>
      <ui.Text size={15} color="#52525b" lineHeight={22}>
        {t("d_why.body")}
      </ui.Text>
      <ui.Frame
        padding={[12, 20]}
        radius={10}
        fill="#18181b"
        align="center"
        justify="center"
        layout="row"
        role="button"
        testId="overlay-close"
        onClick={() => nav.close()}
      >
        <ui.Text size={15} weight={600} color="#ffffff">
          {t("d_why.close")}
        </ui.Text>
      </ui.Frame>
    </ui.Frame>
  );
};

const result = (titleKey: string, bodyKey: string): ScreenModule =>
  function ResultScreen(props) {
    const { ui, t, state, nav } = props;
    return (
      <Shell {...props}>
        <ui.Text size={26} weight={700} color="#18181b" lineHeight={32}>
          {t(titleKey)}
        </ui.Text>
        <ui.Text size={15} color="#52525b" lineHeight={22}>
          {t(bodyKey)}
        </ui.Text>
        <ui.Frame layout="column" gap={4} padding={16} radius={12} fill="#ffffff" border="1px solid #e4e4e7">
          <ui.Text size={13} color="#71717a">goal = {String(state.get("goal"))}</ui.Text>
          <ui.Text size={13} color="#71717a">
            equipment = [{(state.get("equipment") as string[]).join(", ")}]
          </ui.Text>
        </ui.Frame>
        <ui.Frame role="button" testId="restart" onClick={() => nav.show("s_goal")}>
          <ui.Text size={14} weight={500} color="#2563eb" align="center">
            {t("s_done.back")}
          </ui.Text>
        </ui.Frame>
      </Shell>
    );
  };

export const screens: Record<string, ScreenModule> = {
  s_goal: GoalScreen,
  s_gear: GearScreen,
  d_why: WhyOverlay,
  s_weights: result("s_weights.title", "s_weights.body"),
  s_bodyweight: result("s_bodyweight.title", "s_bodyweight.body"),
};

export const manifest = { entry: "s_goal", variables };
