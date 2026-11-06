---
title: Export invoices to CSV
level: L3
productExists: true
outputs: [spec, tests]
audience: the customer who asked for it
---
# Export invoices to CSV

## Problem
Fabrikam's bookkeeper retypes every month's invoices into their accounting program.

## Value
One click exports the month's invoices in the columns the accounting program reads.

## Users
The bookkeeper.

## Main flow
Invoices → pick a month → Export → a CSV downloads.

## Key screens
Invoices list with an Export button, the month picker.

## Scope
A CSV with date, number, customer, net, VAT, total; one row per invoice.

## Out of scope
Direct integrations with accounting programs.

## Data
Existing invoices.

## Rules
Amounts with two decimals, dates as YYYY-MM-DD.

## Open points
None.
