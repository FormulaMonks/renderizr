# 1. Lock an account after five failed sign-ins

Date: 2026-03-01

## Status

Accepted

## Context

Attackers guess passwords against the sign-in endpoint.

## Decision

The Sign In Controller locks an account after five failed sign-ins in a row.

## Consequences

Customers who forget their password call the contact center to unlock it.
