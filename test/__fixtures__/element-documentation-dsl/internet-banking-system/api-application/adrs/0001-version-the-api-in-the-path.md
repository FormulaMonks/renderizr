# 1. Version the API in the path

Date: 2026-02-10

## Status

Accepted

## Context

Mobile App releases lag behind the API.

## Decision

Every endpoint carries its major version in the path, such as `/v1/accounts`.

## Consequences

Old app releases keep working while a new version ships.
