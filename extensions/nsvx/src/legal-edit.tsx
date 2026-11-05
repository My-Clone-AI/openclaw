/** @jsxImportSource @solidjs/web */
import { createSignal, Show } from "solid-js";
import { createAction, Note, view } from "./device-kit.js";
import { FACT_CHOICES, type Evidence, type FactStatus } from "./legal-data.js";
import { changeCaseRequest, type CaseProps } from "./legal-kit.js";
import { Choice, Field, Picks, Toggle } from "./office-kit.js";
import { createSource } from "./ui-kit.js";

export function EditCase(props: CaseProps & { close: () => void }) {
  const ctx = () => props.ctx;
  const row = () => props.row;
  const [values, setValues] = createSignal<Record<string, string>>({
    title: row().title,
    issue: row().issue ?? "",
    description: row().description ?? "",
    stage: row().stage ?? "",
    jurisdiction: row().jurisdiction ?? "",
    court: row().court ?? "",
    external_ref: row().external_ref ?? "",
    procedure: row().procedure ?? "",
    governing_law: row().governing_law ?? "",
    legal_rep: row().legal_rep ?? "",
    amount_claimed: row().amount_claimed ?? "",
    amount_disputed: row().amount_disputed ?? "",
    notes: row().notes ?? "",
    outcome: row().outcome ?? "",
  });
  const [nature, setNature] = createSignal(row().nature);
  const [priority, setPriority] = createSignal(row().priority);
  const [categories, setCategories] = createSignal(row().categories);
  const action = createAction(ctx);
  const field = (name: string, label: string, rows?: number) => (
    <Field
      label={label}
      value={values()[name] ?? ""}
      {...(rows ? { rows } : {})}
      onInput={(value) => setValues({ ...values(), [name]: value })}
    />
  );
  return (
    <form
      class="nsvx-of__form"
      onSubmit={(event) => {
        event.preventDefault();
        void action.run(async () => {
          await changeCaseRequest(ctx(), {
            action: "update",
            key: row().ref,
            revision: row().revision,
            ...values(),
            nature: nature(),
            priority: priority(),
            categories: categories(),
          });
          await props.reload();
          props.close();
        });
      }}
    >
      {field("title", ctx().lt("title"))}
      {field("issue", ctx().lt("issue"), 2)}
      {field("description", ctx().lt("description"), 3)}
      <Choice
        label={ctx().lt("kind")}
        value={nature()}
        options={[
          ["potential", ctx().lt("potential")],
          ["formal", ctx().lt("formal")],
        ]}
        onChange={setNature}
      />
      <Choice
        label={ctx().lt("priority")}
        value={priority()}
        options={Object.entries(ctx().vocab()?.priority ?? { [priority()]: priority() })}
        onChange={setPriority}
      />
      <Picks
        options={Object.entries(ctx().vocab()?.categories ?? {}).map(([id, value]) => ({
          id,
          label: value.label,
        }))}
        value={categories()}
        onChange={setCategories}
      />
      {field("stage", ctx().lt("stage"))}
      {field("jurisdiction", ctx().lt("jurisdiction"))}
      {field("court", ctx().lt("court"))}
      {field("external_ref", ctx().lt("externalRef"))}
      {field("procedure", ctx().lt("procedure"))}
      {field("governing_law", ctx().lt("law"))}
      {field("legal_rep", ctx().lt("lawyer"))}
      {field("amount_claimed", ctx().lt("claimed"))}
      {field("amount_disputed", ctx().lt("disputedAmount"))}
      {field("notes", ctx().lt("notes"), 3)}
      {field("outcome", ctx().lt("outcome"), 2)}
      <Note note={action.note()} />
      <div class="nsvx-dev__bar">
        <button
          type="submit"
          class="nsvx__button nsvx__button--primary"
          disabled={action.busy() || !values().title?.trim()}
        >
          {ctx().lt("save")}
        </button>
      </div>
    </form>
  );
}

export function AddParty(props: CaseProps & { close: () => void }) {
  const ctx = () => props.ctx;
  const [name, setName] = createSignal("");
  const [role, setRole] = createSignal("respondent");
  const [kind, setKind] = createSignal("person");
  const [contact, setContact] = createSignal("");
  const action = createAction(ctx);
  return (
    <form
      class="nsvx-of__form"
      onSubmit={(event) => {
        event.preventDefault();
        void action.run(async () => {
          await changeCaseRequest(ctx(), {
            action: "addParty",
            key: props.row.ref,
            name: name(),
            role: role(),
            kind: kind(),
            contact: contact(),
          });
          await props.reload();
          props.close();
        });
      }}
    >
      <Field label={ctx().lt("nameAsDocs")} value={name()} max={200} required onInput={setName} />
      <Choice
        label={ctx().lt("role")}
        value={role()}
        options={[
          ["respondent", ctx().lt("respondent")],
          ["claimant", ctx().lt("claimant")],
          ["witness", ctx().lt("witness")],
          ["lawyer", ctx().lt("lawyerRole")],
          ["other", ctx().lt("other")],
        ]}
        onChange={setRole}
      />
      <Choice
        label={ctx().lt("kind")}
        value={kind()}
        options={[
          ["person", ctx().lt("person")],
          ["company", ctx().lt("company")],
          ["public_body", ctx().lt("publicBody")],
        ]}
        onChange={setKind}
      />
      <Field label={ctx().lt("contact")} value={contact()} max={500} onInput={setContact} />
      <Note note={action.note()} />
      <div class="nsvx-dev__bar">
        <button
          type="submit"
          class="nsvx__button nsvx__button--primary"
          disabled={action.busy() || !name().trim()}
        >
          {ctx().lt("save")}
        </button>
      </div>
    </form>
  );
}

export function AddFact(props: CaseProps & { close: () => void }) {
  const ctx = () => props.ctx;
  const [text, setText] = createSignal("");
  const [status, setStatus] = createSignal<FactStatus>("owner");
  const [disputed, setDisputed] = createSignal(false);
  const [proofs, setProofs] = createSignal<string[]>([]);
  const evidence = createSource(ctx().host, () =>
    view<{ evidence: Evidence[] }>(ctx().host, "caseEvidence", { id: props.row.ref }),
  );
  void evidence.refresh();
  const action = createAction(ctx);
  // NSVX refuses a confirmed fact without evidence, so the form says so first.
  const blocked = () => !text().trim() || (status() === "confirmed" && proofs().length === 0);
  return (
    <form
      class="nsvx-of__form"
      onSubmit={(event) => {
        event.preventDefault();
        void action.run(async () => {
          await changeCaseRequest(ctx(), {
            action: "addFact",
            key: props.row.ref,
            text: text(),
            status: status(),
            disputed: disputed(),
            evidence_ids: proofs(),
          });
          await props.reload();
          props.close();
        });
      }}
    >
      <Field
        label={ctx().lt("fact")}
        value={text()}
        rows={3}
        max={4000}
        required
        onInput={setText}
      />
      <Choice
        label={ctx().lt("state")}
        value={status()}
        options={FACT_CHOICES.map((value) => [value, ctx().lt(`fact_${value}`)] as const)}
        onChange={setStatus}
      />
      <Toggle label={ctx().lt("inDispute")} checked={disputed()} onChange={setDisputed} />
      <Show when={status() === "confirmed"}>
        <p class="nsvx-of__muted nsvx-of__wide">{ctx().lt("linkProof")}</p>
      </Show>
      <Picks
        options={(evidence.state().data?.evidence ?? []).map((row) => ({
          id: row.id,
          label: row.code ?? row.name,
          title: row.name,
        }))}
        value={proofs()}
        onChange={setProofs}
      />
      <Note note={action.note()} />
      <div class="nsvx-dev__bar">
        <button
          type="submit"
          class="nsvx__button nsvx__button--primary"
          disabled={action.busy() || blocked()}
        >
          {ctx().lt("save")}
        </button>
      </div>
    </form>
  );
}
