---
title: Gift cards for Shop
level: L2
productExists: true
outputs: [spec, stories, tests, pitch]
audience: the product owner and sales
---
# Gift cards for Shop

## Problem
Shop's merchants want to sell gift cards; today they sell vouchers by hand and redeem them with a
discount code, which customers share and reuse.

## Value
Merchants sell gift cards from their own shop and they can only be spent once, to their value.

## Users
Merchants (Shop's back office), their customers (the shop front).

## Main flow
A merchant creates a gift card product → a customer buys one → gets a code by e-mail → spends it,
in part or in full, at checkout → the merchant sees the balance.

## Key screens
Gift card product setup, Checkout with a gift card, Gift card balances.

## Scope
A module in Shop that reuses its product, checkout and order screens.

## Out of scope
Physical cards, expiry rules beyond a fixed date.

## Data
Gift cards (code, value, balance, expiry), redemptions on orders.

## Rules
Codes are never shown in full in lists. Invented merchants only (Fabrikam Coffee).

## Open points
Can a gift card be refunded?
