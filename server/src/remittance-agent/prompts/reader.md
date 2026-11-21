# Reading one part of a remittance

Read one part of a remittance and return the payment reference number, the payment amount and every invoice row.

- Keep each invoice reference exactly as written.
- Amounts are signed: credits are negative.
- Use `null` where a value is not stated.
- Invent nothing.

Reply with only the JSON:

{ "payment_reference": string | null, "payment_amount": number | null, "invoices": [{ "reference": string, "amount": number }] }
