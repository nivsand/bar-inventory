# Screens

All screens are mobile-first (large touch targets, single-column on phones) and
available in Hebrew (RTL) and English (LTR).

- **Login** — credentials sign-in, language toggle.
- **Dashboard** (manager-focused) — Today's Actions (orders due, deliveries
  expected, low/critical stock, open orders, pending approvals), alert lists,
  pending count approvals.
- **Daily Count** — start a count, search + category-grouped large number inputs,
  live progress bar, notes, submit. Managers see a pending-approval list with
  Approve / Request recount / Reject.
- **Inventory** — searchable table (raw + prep), low-stock highlighting; managers
  edit items in a bottom-sheet form (He/En names, category, supplier, unit,
  current/min/par, usage, notes).
- **Suppliers** — cards with contact, ordering method, order-deadline weekdays,
  delivery weekdays, min-order; full editor with weekday pickers.
- **Orders** — smart suggestions grouped by supplier (item, current, min,
  editable suggested qty, reason); Generate Order builds a WhatsApp/email/
  copyable message and opens wa.me / mailto. Below: open orders + status history
  with status dropdown (Need to order → Ordered → Arrived → …).
- **Prep** — recommendations (produce qty + required ingredients with
  availability and shortfall), create task (disabled if ingredients insufficient),
  complete task (consumes ingredients, produces prep).
- **Deliveries** — upload/photograph a receipt → OCR review table (matched items,
  quantities, shortage flags) → confirm to receive into stock. Delivery history.
- **Waste** — quick report form (item, qty, reason, note) + history table.
- **Reports** — CSV export for inventory history, orders, waste, supplier
  performance, consumption trends.
- **Users** (manager) — list + add users with roles.
