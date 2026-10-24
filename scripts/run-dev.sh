#!/bin/sh
# Start Firefox met de extensie geladen via web-ext.
# Snap-Firefox heeft een eigen /tmp-namespace en kan het tijdelijke profiel
# dat web-ext standaard in /tmp aanmaakt niet lezen ("profile cannot be
# loaded"). Daarom altijd een TMPDIR onder $HOME (niet-verborgen: de
# home-interface van snap geeft alleen toegang tot niet-verborgen paden).
# Op niet-snap-systemen is dit onschadelijk.
set -e

mkdir -p "$HOME/tmp"
export TMPDIR="$HOME/tmp"

exec npx web-ext run --source-dir dist
