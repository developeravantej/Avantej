PATH = r'C:/Project/Avantej/apps/web/src/components/appointments/appointment-list.tsx'

with open(PATH, 'rb') as f:
    data = f.read()

def rep(old, new, tag):
    global data
    count = data.count(old)
    assert count == 1, f"{tag}: found {count} times (expected 1)"
    data = data.replace(old, new, 1)
    print(f"OK: {tag}")

# ── R1: Replace useEffect + add lastScrolledTrainerRef + scrollToToday ─────────
rep(
    (
        b'\tuseEffect(() => {\n'
        b'\t\tif (isLoading) return;\n'
        b'\t\tif (todayRef.current && scrollRef.current) {\n'
        b'\t\t\tconst offset = todayRef.current.offsetTop - 16;\n'
        b'\t\t\tscrollRef.current.scrollTop = Math.max(0, offset);\n'
        b'\t\t}\n'
        b'\t}, [isLoading]);\n'
    ),
    (
        b'\tconst lastScrolledTrainerRef = useRef<string | null | undefined>(undefined);\n'
        b'\n'
        b'\tfunction scrollToToday() {\n'
        b'\t\tif (todayRef.current && scrollRef.current) {\n'
        b'\t\t\tscrollRef.current.scrollTop = Math.max(0, todayRef.current.offsetTop - 16);\n'
        b'\t\t}\n'
        b'\t}\n'
        b'\n'
        b'\tuseEffect(() => {\n'
        b'\t\tconst trainerId = defaultTrainerId ?? null;\n'
        b'\t\tif (lastScrolledTrainerRef.current === trainerId) return;\n'
        b'\t\tif (isLoading) return;\n'
        b'\t\tlastScrolledTrainerRef.current = trainerId;\n'
        b'\t\trequestAnimationFrame(scrollToToday);\n'
        b'\t}, [defaultTrainerId, isLoading, appointments]);\n'
    ),
    "R1 replace useEffect with trainer-aware scroll"
)

# ── R2: Simplify Today button to use scrollToToday ─────────────────────────────
rep(
    (
        b'\t\t\t\t\t\t\t\tonClick={() => {\n'
        b'\t\t\t\t\t\t\t\t\tsetCurrentMonth(new Date());\n'
        b'\t\t\t\t\t\t\t\t\tsetTimeout(() => {\n'
        b'\t\t\t\t\t\t\t\t\t\tif (todayRef.current && scrollRef.current) {\n'
        b'\t\t\t\t\t\t\t\t\t\t\tscrollRef.current.scrollTop = Math.max(0, todayRef.current.offsetTop - 16);\n'
        b'\t\t\t\t\t\t\t\t\t\t}\n'
        b'\t\t\t\t\t\t\t\t\t}, 0);\n'
        b'\t\t\t\t\t\t\t\t}}\n'
    ),
    (
        b'\t\t\t\t\t\t\t\tonClick={() => {\n'
        b'\t\t\t\t\t\t\t\t\tsetCurrentMonth(new Date());\n'
        b'\t\t\t\t\t\t\t\t\tlastScrolledTrainerRef.current = undefined;\n'
        b'\t\t\t\t\t\t\t\t\trequestAnimationFrame(scrollToToday);\n'
        b'\t\t\t\t\t\t\t\t}}\n'
    ),
    "R2 simplify Today button click"
)

# ── R3: Add today-anchor computation after monthLabel ─────────────────────────
rep(
    b'\tconst monthLabel = currentMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });\n',
    (
        b'\tconst monthLabel = currentMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });\n'
        b'\n'
        b'\t// Pre-compute where to place the "today" anchor for months where today has no appointments\n'
        b'\tconst _tnow = new Date();\n'
        b'\tconst _todayKey = `${_tnow.getFullYear()}-${String(_tnow.getMonth()).padStart(2, "0")}-${String(_tnow.getDate()).padStart(2, "0")}`;\n'
        b'\tconst _isCurrMonth = currentMonth.getFullYear() === _tnow.getFullYear() && currentMonth.getMonth() === _tnow.getMonth();\n'
        b'\tconst _todayInList = dateKeys.includes(_todayKey);\n'
        b'\tconst _insertBeforeKey = (_isCurrMonth && !_todayInList)\n'
        b'\t\t? (dateKeys.find((k) => k > _todayKey) ?? null)\n'
        b'\t\t: null;\n'
        b'\tconst _anchorAtEnd = _isCurrMonth && !_todayInList && _insertBeforeKey === null && dateKeys.length > 0;\n'
    ),
    "R3 add today-anchor computation"
)

# ── R4: Add anchor element before its target section in the map ───────────────
rep(
    (
        b'\t\t\t\t\t\treturn (\n'
        b'\t\t\t\t\t\t\t<div key={key} ref={todayDate ? todayRef : undefined}>\n'
    ),
    (
        b'\t\t\t\t\t\treturn (\n'
        b'\t\t\t\t\t\t\t<>\n'
        b'\t\t\t\t\t\t\t{_insertBeforeKey === key && <div key="today-anchor" ref={todayRef} />}\n'
        b'\t\t\t\t\t\t\t<div key={key} ref={todayDate ? todayRef : undefined}>\n'
    ),
    "R4 inject today anchor before future section"
)

# ── R5: Close the new fragment wrapper ────────────────────────────────────────
# Each date section now ends with </div>, and we need to close <> for the fragment
# The map's return used to end with: </div>\n\t\t\t\t\t);\n
# Now it ends with: </div>\n\t\t\t\t\t</>\n\t\t\t\t\t);\n
# Find the end of the date group rendering (closing tag + semicolon)
# The last thing in the map return is:
#   \t\t\t\t\t\t\t</div>\n\t\t\t\t\t\t);\n\t\t\t\t\t})}\n
# We need to close the <> that we opened in R4
rep(
    (
        b'\t\t\t\t\t\t\t</div>\n'
        b'\t\t\t\t\t\t);\n'
        b'\t\t\t\t\t})}\n'
    ),
    (
        b'\t\t\t\t\t\t\t</div>\n'
        b'\t\t\t\t\t\t\t</>\n'
        b'\t\t\t\t\t\t);\n'
        b'\t\t\t\t\t})}\n'
    ),
    "R5 close fragment wrapper in map"
)

# ── R6: Add anchor-at-end after the map, before closing space-y-10 div ────────
rep(
    (
        b'\t\t\t\t\t})}\n'
        b'\t\t\t\t</div>\n'
    ),
    (
        b'\t\t\t\t\t})}\n'
        b'\t\t\t\t\t{_anchorAtEnd && <div ref={todayRef} />}\n'
        b'\t\t\t\t</div>\n'
    ),
    "R6 add anchor-at-end after map"
)

with open(PATH, 'wb') as f:
    f.write(data)

print("\nAll done.")
