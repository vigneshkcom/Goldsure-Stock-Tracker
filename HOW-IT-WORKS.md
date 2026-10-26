# How the Stock Tracker is wired

## The one rule

**There is no stored "stock level" anywhere.** Every number you see is added up
from the movement history on the fly. A balance is simply:

```
everything that came in  −  everything that went out
```

So you never edit a count. You record *what happened*, and the count follows.
That is why the Movements tab is the real source of truth and everything else
is a view of it.

Three things qualify that sum:

- **Good vs faulty are separate piles.** Every movement carries a condition, and
  a faulty unit never mixes with the good count.
- **In-transit stock is on nobody's count.** The moment you email a pickup slip,
  the warehouse is debited, but the electrician is *not* credited until you
  confirm collection. In between it shows as amber "in transit".
- **Some actions write two movements.** Marking stock faulty and a product swap
  each write a pair (one out, one in), because a single movement can only carry
  one product and one condition.

---

## Changing an electrician's stock level

Pick by **what actually happened in real life**. Everything below lives on
**Electricians → pick the electrician**, except the last row.

| What happened | Use | Effect |
|---|---|---|
| Warehouse is sending them stock | **Request stock** tab → email the slip | Warehouse drops now; they get it on confirm |
| They've now collected it | **"<Name> has it"** on the In transit box | Lands on their count. Needs a tracking link |
| You're handing them stock directly | **Give stock** tab | Warehouse → them, straight away |
| They fitted it on a job | **Install** tab | Comes off their count |
| They passed it to another electrician | **Transfer** tab | Moves between the two, no warehouse round-trip |
| They fitted a different product than recorded | **Product swap** box (Overview) | Moves units between products, total unchanged |
| Stock is lost or unaccounted for | **Loss** tab | Comes off, recorded as a loss, optionally charged |
| They sent stock back | Movements tab → **Return to warehouse** | Them → warehouse (good or faulty) |
| The number is just wrong | Movements tab → **Adjust count** | See below |

### When the number is just wrong

Movements tab → **Move Stock** → *Adjust count*, then pick the electrician.
Three modes:

- **Physical stocktake count** — you counted them and there are 47. Enter 47 and
  it works out the difference itself. Use this when you know the true total.
- **Add (in)** — found stock, or they had more than recorded.
- **Remove (out)** — stock is gone and it isn't a loss you want on the loss
  report.

Always put a note on it. An adjustment with no explanation is the thing you'll
be squinting at in six months.

### Which of these do I actually want?

- *Stock physically left their van* → Install, Loss, Transfer or Return. Pick
  the one that says where it went.
- *Nothing physically moved, the record was wrong* → Adjust count, or Product
  swap if the right quantity was recorded against the wrong product.
- *It's a counting dispute with the warehouse* → Physical stocktake count, so
  the correction is dated and explained.

---

## Fixing a mistake

Open the movement in **Movements** and delete it. The balances recalculate
immediately, because nothing is stored.

> **Watch out:** *Marked faulty* and *Product swap* each wrote **two** rows.
> Delete only one and you'll create stock out of nothing. Delete both.

---

## Where things live in the code

| File | What's in it |
|---|---|
| `src/App.tsx` | The whole app: balance maths, every tab, every form |
| `src/types.ts` | Movement shape, movement types, conditions, statuses |
| `src/pickupSlip.ts` | Email bodies and report inputs |
| `src/reportPdf.ts` | The PDFs: pickup slip, stock report, warehouse report |
| `src/excelExport.ts` | The Download Excel workbook |
| `src/styles.css` | All styling, appended in layers — later rules win |
| `supabase/schema.sql` | The database schema |

A few anchors inside `App.tsx`:

- `calculateBalances()` — the sum described at the top, including the
  in-transit rule
- `isPendingMovement()` — what counts as in transit
- `handleSwapProduct()`, `handleTransferStock()`, `confirmPendingPickup()` —
  the newer actions

### Supabase

The app shares one Supabase project, with no logins — anyone who opens the site
reads and writes the same rows. If there's no Supabase configured it falls back
to this browser's storage, and the footer tells you which you're on
("Shared cloud" vs "This device only").

**`supabase/schema.sql` is not applied automatically.** When a change adds a
column or a new movement type, you have to paste the SQL into the Supabase SQL
editor yourself, or saving will fail with "Could not save movement". The file is
safe to re-run from top to bottom.
