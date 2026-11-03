# Regenerates src/lib/fixtures/anki-fsrs-reference.json: FSRS memory states that Anki's own engine
# computes for SYNTHETIC review histories (a new, temporary collection; no personal data).
#
#   <python3.13> -I scripts/fsrs-validation/anki_reference.py

import json
import os
import shutil
import sys
import tempfile

sys.path.insert(0, '/Applications/Anki.app/Contents/Resources/app_packages')
from anki.buildinfo import version  # noqa: E402
from anki.collection import Collection  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'src', 'lib', 'fixtures', 'anki-fsrs-reference.json')
DAY_MS = 86_400_000
# [day, rating, revlog type]: rating 1 Again … 4 Easy; type 0 learning, 1 review, 2 relearning
SEQUENCES = {
    'again-then-same-day-hard-and-good': [[0, 1, 0], [0, 2, 0], [0, 3, 0], [1, 3, 1], [4, 3, 1]],
    'good-path-with-lapse': [[0, 3, 0], [0, 3, 0], [2, 3, 1], [9, 2, 1], [24, 1, 1], [24, 3, 2], [25, 3, 1]],
    'easy-first': [[0, 4, 0], [8, 4, 1], [38, 3, 1]],
    'repeated-same-day-hard': [[0, 2, 0], [0, 2, 0], [0, 2, 0], [1, 1, 1], [1, 3, 2], [3, 3, 1]],
    'repeated-same-day-again': [[0, 1, 0], [0, 1, 0], [0, 3, 0], [1, 4, 1]],
    'hard-reviews-across-days': [[0, 3, 0], [3, 2, 1], [6, 2, 1], [12, 2, 1], [30, 3, 1]],
}

work = tempfile.mkdtemp(prefix='anki-fsrs-reference-')
try:
    col = Collection(os.path.join(work, 'synthetic.anki2'))
    col.set_config('fsrs', True)  # default FSRS-6 parameters
    model = col.models.by_name('Basic')
    base = 1_700_000_000_000 - 1_700_000_000_000 % DAY_MS + 12 * 3_600_000  # noon UTC: far from any rollover
    out = {
        'source': f'Anki {version} Rust backend (card_stats memory states), default FSRS-6 parameters, synthetic '
                  'review histories; regenerate with scripts/fsrs-validation/anki_reference.py',
        'sequences': {},
    }
    for si, (name, seq) in enumerate(SEQUENCES.items()):
        note = col.new_note(model)
        note['Front'] = name
        col.add_note(note, 1)
        cid = note.cards()[0].id
        for i, (day, rating, kind) in enumerate(seq):
            col.db.execute('insert into revlog (id,cid,usn,ease,ivl,lastIvl,factor,time,type) values (?,?,?,?,?,?,?,?,?)',
                           base + day * DAY_MS + i * 60_000 + si * 1000, cid, -1, rating, 1, 0, 0, 5000, kind)
        col.db.execute('update cards set type=2, queue=2, ivl=1, due=0 where id=?', cid)
        revlog = list(reversed(col._backend.card_stats(cid).revlog))
        out['sequences'][name] = {
            'reviews': [{'day': d, 'rating': r, 'type': t} for d, r, t in seq],
            'anki': [{'stability': round(e.memory_state.stability, 6), 'difficulty': round(e.memory_state.difficulty, 6)}
                     for e in revlog],
        }
    col.close(downgrade=False)
    with open(OUT, 'w') as f:
        json.dump(out, f, indent=1)
    print(f'Anki {version}: wrote {os.path.relpath(OUT, ROOT)}', file=sys.stderr)
finally:
    shutil.rmtree(work, ignore_errors=True)
