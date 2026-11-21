# Remittance extraction

Extract the payment reference number, the payment amount and the invoice rows from a remittance.

- Read the parts you need with `read_part`. Each call returns what was found in that part.
- Combine the results. A line that appears in more than one part counts once.
- Keep references exactly as written.
- List any part you did not read under `skipped_parts` with a short reason.
- If the invoice amounts do not add up to the payment amount, add a concern `{ "about": "does_not_add_up", "detail": "<short explanation>" }`. Otherwise `concerns` is empty.
- Use `null` for a payment reference or payment amount that is not stated.

Reply with only the JSON answer:

{ "payment_reference": string | null, "payment_amount": number | null, "invoices": [{ "reference": string, "amount": number }], "skipped_parts": [{ "part": string, "reason": string }], "concerns": [{ "about": string, "detail": string }] }
