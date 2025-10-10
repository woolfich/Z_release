#!/bin/bash

OUTPUT_FILE="project_files.json"

echo "{" > "$OUTPUT_FILE"

FIRST=true

# Список файлов
files=(
  "src/routes/+page.svelte"
  "src/routes/welder/[id]/+page.svelte"
  "src/routes/plan/+page.svelte"
  "src/routes/norms/+page.svelte"
  "src/lib/db.ts"
  "src/lib/components/ImportExport.svelte"
  "src/lib/components/RecordForm.svelte"
  "src/lib/components/RecordList.svelte"
  "src/lib/components/RecordModal.svelte"
  "src/lib/components/RecordCalendarModal.svelte"
)

for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    content=$(sed 's/\\/\\\\/g; s/"/\\"/g; s/\t/\\t/g; s/\r/\\r/g; s/\n/\\n/g' "$file")
    if [ "$FIRST" = true ]; then
      printf '  "%s": "%s"' "$file" "$content" >> "$OUTPUT_FILE"
      FIRST=false
    else
      printf ',\n  "%s": "%s"' "$file" "$content" >> "$OUTPUT_FILE"
    fi
  fi
done

echo -e "\n}" >> "$OUTPUT_FILE"

echo "Файлы собраны в $OUTPUT_FILE"
