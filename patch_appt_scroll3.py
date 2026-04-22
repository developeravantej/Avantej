PATH = r'C:/Project/Avantej/apps/web/src/components/appointments/appointment-list.tsx'

with open(PATH, 'rb') as f:
    data = f.read()

def rep(old, new, tag):
    global data
    count = data.count(old)
    assert count == 1, f"{tag}: found {count} times (expected 1)"
    data = data.replace(old, new, 1)
    print(f"OK: {tag}")

# ── R5: Close the <> fragment wrapper (10-tab </div>, 9-tab );, 8-tab })} ) ────
rep(
    (
        b'\t\t\t\t\t\t\t\t\t\t</div>\n'
        b'\t\t\t\t\t\t\t\t\t);\n'
        b'\t\t\t\t\t\t\t\t})}\n'
    ),
    (
        b'\t\t\t\t\t\t\t\t\t\t</div>\n'
        b'\t\t\t\t\t\t\t\t\t\t</>\n'
        b'\t\t\t\t\t\t\t\t\t);\n'
        b'\t\t\t\t\t\t\t\t})}\n'
    ),
    "R5 close fragment wrapper"
)

# ── R6: Add _anchorAtEnd after dateKeys.map, before space-y-10 closing div ─────
rep(
    (
        b'\t\t\t\t\t\t\t\t})}\n'
        b'\t\t\t\t\t\t\t</div>\n'
    ),
    (
        b'\t\t\t\t\t\t\t\t})}\n'
        b'\t\t\t\t\t\t\t\t{_anchorAtEnd && <div ref={todayRef} />}\n'
        b'\t\t\t\t\t\t\t</div>\n'
    ),
    "R6 add anchor-at-end element"
)

with open(PATH, 'wb') as f:
    f.write(data)

print("\nAll done.")
