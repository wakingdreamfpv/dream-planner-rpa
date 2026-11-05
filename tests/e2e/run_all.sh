#!/bin/bash
# Runs every browser suite in tests/e2e and the database / function suites. Build first: npm run build:all
cd "$(dirname "$0")/../.."
python3 -c "import sys; sys.path.insert(0,'tests/e2e'); import harness; harness.ensure_server()"
fails=0
for f in tests/e2e/t_*.py; do
  r=$(timeout 600 python3 "$f" 2>&1); n=$(echo "$r" | grep -c '^FAIL'); tb=$(echo "$r" | grep -c Traceback)
  echo "E2E:$(basename $f) | fails=$n tb=$tb | $(echo "$r" | grep -E 'fails=' | tail -1)"
  [ $n -gt 0 ] && echo "$r" | grep '^FAIL' | head -5; [ $tb -gt 0 ] && echo "$r" | grep -E "Error" | tail -2
  fails=$((fails + n + tb))
done
(cd supabase/tests && for f in rls*.test.mjs; do echo "DB:$f $(node $f 2>&1 | tail -1)"; done)
echo "ALLDONE fails=$fails"
