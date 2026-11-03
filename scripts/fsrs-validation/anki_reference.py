# Regenerates src/lib/fixtures/anki-fsrs-reference.json: FSRS memory states that Anki's own engine
# computes for SYNTHETIC review histories (a new, temporary collection; no personal data), plus the
# protobuf blobs Anki writes for a few synthetic presets (so the preset reader can be tested on real bytes).
#
#   <python3.13> -I scripts/fsrs-validation/anki_reference.py

import base64
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
# Non-default presets: a card in a subdeck on its own FSRS-6 preset, and a preset optimised under FSRS-4.5
# (17 parameters, stored by Anki 26.9 under the legacy key fsrsWeights / protobuf field 3)
PRESET_SEQUENCE = [[0, 3, 0], [0, 3, 0], [2, 3, 1], [9, 2, 1], [24, 1, 1], [24, 3, 2], [25, 3, 1], [40, 4, 1]]
FSRS6_CUSTOM = [0.3, 1.1, 3.0, 9.0, 6.0, 0.7, 2.5, 0.01, 1.7, 0.15, 0.85, 1.5, 0.07, 0.25, 1.6, 0.5, 2.0, 0.5, 0.1,
                0.07, 0.2]
FSRS45 = [0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367, 1.0461, 2.1072, 0.0793,
          0.3246, 1.587, 0.2272, 2.8755]

work = tempfile.mkdtemp(prefix='anki-fsrs-reference-')
try:
    col = Collection(os.path.join(work, 'synthetic.anki2'))
    col.set_config('fsrs', True)  # default FSRS-6 parameters
    model = col.models.by_name('Basic')
    base = 1_700_000_000_000 - 1_700_000_000_000 % DAY_MS + 12 * 3_600_000  # noon UTC: far from any rollover
    out = {
        'source': f'Anki {version} Rust backend (card_stats memory states), synthetic review histories; sequences use '
                  'the default FSRS-6 parameters, presets use their own; regenerate with scripts/fsrs-validation/anki_reference.py',
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

    # Presets: Anki's protobuf blobs, and the states it computes for cards that use them
    def add_preset(name, change):
        conf = col.decks.get_config(col.decks.add_config_returning_id(name))
        change(conf)
        col.decks.update_config(conf)
        return conf['id']

    def zero_limits(conf):
        conf['new']['perDay'] = 0
        conf['rev']['perDay'] = 0

    def fsrs6(conf):
        conf['fsrsParams6'] = FSRS6_CUSTOM

    def fsrs45(conf):
        conf['fsrsWeights'] = FSRS45
        conf['fsrsParams5'] = []
        conf['fsrsParams6'] = []

    presets = {'zero-limits': add_preset('Zero limits', zero_limits), 'fsrs6-custom': add_preset('FSRS-6 custom', fsrs6),
               'fsrs45': add_preset('FSRS-4.5', fsrs45)}
    out['presetBlobs'] = {k: base64.b64encode(bytes(col.db.scalar('select config from deck_config where id=?', v))).decode()
                          for k, v in presets.items()}
    out['presets'] = {}
    for pi, (name, params, deck) in enumerate([('fsrs6-custom', FSRS6_CUSTOM, 'Top::Subdeck on its own preset'),
                                               ('fsrs45', FSRS45, 'FSRS-4.5 deck')]):
        did = col.decks.id(deck)
        d = col.decks.get(did)
        d['conf'] = presets[name]
        col.decks.save(d)
        note = col.new_note(model)
        note['Front'] = name
        col.add_note(note, did)
        cid = note.cards()[0].id
        for i, (day, rating, kind) in enumerate(PRESET_SEQUENCE):
            col.db.execute('insert into revlog (id,cid,usn,ease,ivl,lastIvl,factor,time,type) values (?,?,?,?,?,?,?,?,?)',
                           base + day * DAY_MS + i * 60_000 + (len(SEQUENCES) + pi) * 1000, cid, -1, rating, 1, 0, 0, 5000, kind)
        col.db.execute('update cards set type=2, queue=2, ivl=1, due=0 where id=?', cid)
        revlog = list(reversed(col._backend.card_stats(cid).revlog))
        out['presets'][name] = {
            'params': params,
            'reviews': [{'day': d, 'rating': r, 'type': t} for d, r, t in PRESET_SEQUENCE],
            'anki': [{'stability': round(e.memory_state.stability, 6), 'difficulty': round(e.memory_state.difficulty, 6)}
                     for e in revlog],
        }
    col.close(downgrade=False)
    with open(OUT, 'w') as f:
        json.dump(out, f, indent=1)
    print(f'Anki {version}: wrote {os.path.relpath(OUT, ROOT)}', file=sys.stderr)
finally:
    shutil.rmtree(work, ignore_errors=True)
