PATH = r'C:/Project/Avantej/apps/web/src/components/appointments/appointment-list.tsx'

with open(PATH, 'rb') as f:
    data = f.read()

def rep(old, new, tag):
    global data
    count = data.count(old)
    assert count == 1, f"{tag}: found {count} times (expected 1)"
    data = data.replace(old, new, 1)
    print(f"OK: {tag}")

# ── R4: Add anchor element before its target section (9 tabs = return level) ──
rep(
    (
        b'\t\t\t\t\t\t\t\t\treturn (\n'
        b'\t\t\t\t\t\t\t\t\t\t<div key={key} ref={todayDate ? todayRef : undefined}>\n'
    ),
    (
        b'\t\t\t\t\t\t\t\t\treturn (\n'
        b'\t\t\t\t\t\t\t\t\t\t<>\n'
        b'\t\t\t\t\t\t\t\t\t\t{_insertBeforeKey === key && <div key="today-anchor" ref={todayRef} />}\n'
        b'\t\t\t\t\t\t\t\t\t\t<div key={key} ref={todayDate ? todayRef : undefined}>\n'
    ),
    "R4 inject today anchor before future section"
)

# ── R5: Close the new fragment wrapper ────────────────────────────────────────
# Find the closing of the map return - the last </div> before );
# We need to find the exact end of the date section's return
# After R4 we injected <> so we need to close with </>
# The map ends with: \t\t\t\t\t\t\t\t\t</div>\n\t\t\t\t\t\t\t\t);\n\t\t\t\t\t\t\t})}\n
import sys
sys.stdout = open(sys.stdout.fileno(), mode='wb', buffering=0, closefd=False)
idx = data.find(b'ref={todayDate ? todayRef : undefined}')
# Show context after this div to find the end of the return
sys.stdout.write(b'After ref div: ' + repr(data[idx:idx+500]).encode('utf-8') + b'\n')
