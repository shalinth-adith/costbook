"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import type { Ingredient } from "@/core/ingredient";
import type { Recipe } from "@/core/recipe";

import { type Draft, draftFrom } from "@/lib/draft";

/**
 * New dish — name it, then paste what goes in it.
 *
 * A screen, not a modal. The modal it replaces asked for a name and a portion
 * count, created an empty dish and left the operator on a blank cost sheet to
 * add lines one at a time through a picker.
 *
 * That is the shape of entry every costing product loses its users to. The
 * trade press is consistent about it — ten hours a week per location, and
 * operators quit before the payoff arrives — and the fastest entry any of them
 * offers is a box you paste a recipe into. meez states the principle plainly:
 * entry should feel like writing in a notebook and perform like a spreadsheet.
 *
 * The chef has already written this recipe down. In a notebook, a phone note,
 * the sheet they have kept for years. So the second field is a box, and
 * everything under it is Costbook showing its work: what it recognised, what
 * it will link to a sub-recipe rather than duplicate, what it will create, and
 * what it could not read. Nothing is guessed — a line it cannot read is named
 * back rather than costed at a figure nobody entered.
 */

const CATEGORIES = [
  "Breakfast",
  "Tiffin",
  "Starters",
  "Mains",
  "Biryani",
  "Snacks",
  "Beverages",
  "Desserts",
] as const;

const PLACEHOLDER = `Paste it, or type a line each. Any of these read:

200 g Onion
Sesame oil - 10 ml
1/2 kg Rice
2 large Onions`;

function Row({ row }: { row: Draft["lines"][number] }) {
  const { line, match } = row;

  return (
    <div className={`nd-row${row.ready ? "" : " is-open"}`}>
      <span className="nd-qty figure">
        {line.qty === null ? "—" : `${String(line.qty)}${line.unit ?? ""}`}
      </span>
      <span className="nd-name">{line.name === "" ? line.raw : line.name}</span>
      <span className="nd-verdict">
        {match.kind === "recipe" && (
          <span className="nd-tag is-linked">
            links to your {match.recipe.name}
          </span>
        )}
        {match.kind === "ingredient" &&
          match.ingredient.purchasePrice !== null && (
            <span className="nd-tag is-known">on your shelf</span>
          )}
        {match.kind === "ingredient" &&
          match.ingredient.purchasePrice === null && (
            <span className="nd-tag is-open">on your shelf, no rate yet</span>
          )}
        {match.kind === "new" && (
          <span className="nd-tag is-new">new ingredient</span>
        )}
        {line.needs === "quantity" && (
          <span className="nd-tag is-open">needs a quantity</span>
        )}
        {line.needs === "unit" && (
          <span className="nd-tag is-open">needs a unit</span>
        )}
      </span>
    </div>
  );
}

export function NewDishView({
  shelf,
  recipes,
  onCreate,
}: {
  shelf: readonly Ingredient[];
  recipes: readonly Recipe[];
  onCreate: (input: {
    name: string;
    category: string;
    portions: number;
    text: string;
  }) => Promise<{ readonly message: string; readonly id: string | null }>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>("Mains");
  const [portions, setPortions] = useState(4);
  const [text, setText] = useState("");
  const [fault, setFault] = useState<string | null>(null);

  /*
   * Read as they type, in the browser.
   *
   * `core/loose.ts` and `lib/draft.ts` are pure, so running them here costs
   * nothing but agreement — the same trade the cost sheet already makes. The
   * point is that the operator sees what Costbook understood *before* they
   * commit to it, rather than finding out on a cost sheet afterwards.
   */
  const draft = useMemo(
    () => draftFrom({ text, shelf, recipes }),
    [text, shelf, recipes],
  );

  const ready = name.trim() !== "";

  const submit = () => {
    if (!ready || pending) return;
    setFault(null);
    start(async () => {
      const out = await onCreate({
        name: name.trim(),
        category,
        portions,
        text,
      });
      if (out.id === null) {
        setFault(out.message);
        return;
      }
      router.push(`/recipes/${out.id}`);
    });
  };

  const counted = draft.lines.length;

  return (
    <>
      <div className="page-head">
        <div className="page-title-block">
          <div className="crumbs">
            <Link href="/recipes">Recipes</Link>
            <span aria-hidden="true">/</span>
            <span>New dish</span>
          </div>
          <h1 className="page-title">What are you making?</h1>
          <p className="page-sub">
            Two things, then what goes in it. Costbook works out the cost; you
            never have to.
          </p>
        </div>
      </div>

      <div className="nd">
        <section className="nd-block">
          <div className="nd-fields">
            <label className="nd-field nd-field-name">
              <span className="nd-label">Dish name</span>
              <input
                className="set-input"
                value={name}
                autoFocus
                placeholder="Ghee Podi Idly Fry"
                onChange={(e) => setName(e.target.value)}
              />
            </label>

            <label className="nd-field">
              <span className="nd-label">One batch makes</span>
              <div className="nd-portions">
                <input
                  className="set-input figure"
                  type="number"
                  min={1}
                  value={portions}
                  onChange={(e) =>
                    setPortions(Math.max(1, Number(e.target.value) || 1))
                  }
                />
                <span className="nd-suffix">portions</span>
              </div>
              {/* Asked now because it is the divisor under every cost that
                  follows. Asking later means recosting everything. */}
              <span className="nd-help">
                Every cost below is divided by this.
              </span>
            </label>

            <label className="nd-field">
              <span className="nd-label">Section</span>
              <select
                className="set-input"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="nd-block">
          <h2 className="nd-h">What goes in it?</h2>
          <p className="nd-lede">
            Paste the recipe you already have — a note, a photo caption, an old
            sheet. One ingredient a line, in whatever order you write them.
            Headings ending in a colon are skipped.
          </p>
          <textarea
            className="nd-paste"
            value={text}
            rows={10}
            spellCheck={false}
            placeholder={PLACEHOLDER}
            onChange={(e) => setText(e.target.value)}
          />
        </section>

        {counted > 0 && (
          <section className="nd-block">
            <h2 className="nd-h">
              Costbook read <span className="figure">{counted}</span>{" "}
              {counted === 1 ? "line" : "lines"}
            </h2>
            <p className="nd-lede">
              {draft.linked > 0 && (
                <>
                  <span className="figure">{draft.linked}</span> of them point
                  at recipes you already make, so a rate change inside one will
                  reach this dish on its own.{" "}
                </>
              )}
              {draft.created.length > 0 && (
                <>
                  <span className="figure">{draft.created.length}</span> new{" "}
                  {draft.created.length === 1 ? "ingredient" : "ingredients"}{" "}
                  will be created with no rate — the dish reports a floor until
                  you give them one.{" "}
                </>
              )}
              {draft.needing === 0 && counted > 0 && (
                <>Everything here can be costed straight away.</>
              )}
            </p>

            <div className="card nd-rows">
              {draft.lines.map((row, i) => (
                <Row key={`${row.line.raw}-${String(i)}`} row={row} />
              ))}
            </div>
          </section>
        )}

        {fault !== null && (
          <div className="card card-note nd-fault">
            <span>{fault}</span>
          </div>
        )}

        <div className="nd-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!ready || pending}
            onClick={submit}
          >
            {pending
              ? "Creating…"
              : counted > 0
                ? `Create with ${String(counted)} lines`
                : "Create the dish"}
          </button>
          <Link href="/recipes" className="btn">
            Cancel
          </Link>
          {!ready && (
            <span className="nd-hint">A name is all that is required.</span>
          )}
        </div>
      </div>
    </>
  );
}
