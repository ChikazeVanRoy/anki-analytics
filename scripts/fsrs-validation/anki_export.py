# Runs Anki's own FSRS engine (the Rust backend bundled with Anki.app) on a THROWAWAY copy of
# data/collection.anki2 and saves what it computes, so compare.ts can check this app against it.
#
#   <python3.13> -I scripts/fsrs-validation/anki_export.py
#
# Writes data/fsrs-validation/anki.json (git-ignored with the rest of /data/). Nothing is written to
# Anki's own files or to data/collection.anki2: Anki opens a temporary copy, which is deleted afterwards.

import json
import os
import re
import shutil
import sys
import tempfile

APP_PACKAGES = '/Applications/Anki.app/Contents/Resources/app_packages'
sys.path.insert(0, APP_PACKAGES)
from anki.buildinfo import version  # noqa: E402
from anki.collection import Collection  # noqa: E402
from anki import scheduler_pb2  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SOURCE = os.path.join(ROOT, 'data', 'collection.anki2')
OUT = os.path.join(ROOT, 'data', 'fsrs-validation', 'anki.json')
# Same deck grouping as server/anki.ts (top-level deck name)
GROUPS = [('mandarin', re.compile(r'^(chinese|mandarin)', re.I)), ('portuguese', re.compile(r'^portuguese', re.I))]
DEFAULT_PARAMS = [0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835,
                  0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542]
NEW_PER_DAY = [0, 10, 30]
DAYS = 365

work = tempfile.mkdtemp(prefix='anki-fsrs-validation-')
try:
    copy = os.path.join(work, 'collection.anki2')
    shutil.copyfile(SOURCE, copy)  # the -wal/-shm of data/ are not needed: the API copy is checkpointed
    col = Collection(copy)
    out = {'ankiVersion': version, 'groups': {}}
    tops = {}
    for d in col.decks.all_names_and_ids():
        top = d.name.split('::')[0]
        for gid, rx in GROUPS:
            if rx.search(top):
                tops.setdefault(gid, set()).add(top)
    for gid, names in tops.items():
        search = '(' + ' OR '.join(f'"deck:{n}"' for n in sorted(names)) + ')'
        did = col.decks.id_for_name(sorted(names)[0])
        conf = col.decks.config_dict_for_deck_id(did)
        params = list(conf.get('fsrsParams6') or []) or DEFAULT_PARAMS
        relearn_steps = len(conf['lapse']['delays'])

        # 1. Anki's memory state after every review, as shown in Card Info
        states = {}
        for cid in col.find_cards(search):
            revlog = col._backend.card_stats(cid).revlog  # newest first
            states[str(cid)] = [[e.time, e.button_chosen, e.memory_state.stability if e.HasField('memory_state') else None,
                                 e.memory_state.difficulty if e.HasField('memory_state') else None] for e in reversed(revlog)]

        # 2. Anki's evaluation of the preset's parameters and of freshly optimised ones (not saved)
        current = col._backend.evaluate_params_legacy(params=params, search=search, ignore_revlogs_before_ms=0)
        cross_validated = col._backend.evaluate_params(search=search, ignore_revlogs_before_ms=0,
                                                       num_of_relearning_steps=relearn_steps)
        opt = col._backend.compute_fsrs_params(search=search, current_params=[], ignore_revlogs_before_ms=0,
                                               num_of_relearning_steps=relearn_steps, health_check=True)
        optimised = list(opt.params)
        in_sample = col._backend.evaluate_params_legacy(params=optimised, search=search, ignore_revlogs_before_ms=0)

        # 3. Anki's built-in simulator, same settings as compare.ts uses for ours
        studied = len(col.find_cards(f'{search} -is:new -is:suspended'))
        new_pool = len(col.find_cards(f'{search} is:new -is:suspended'))
        sims = {}
        for new in NEW_PER_DAY:
            req = scheduler_pb2.SimulateFsrsReviewRequest(
                params=params, desired_retention=conf['desiredRetention'], deck_size=studied + new_pool,
                days_to_simulate=DAYS, new_limit=new, review_limit=conf['rev']['perDay'],
                max_interval=conf['rev']['maxIvl'], search=search, new_cards_ignore_review_limit=True,
                easy_days_percentages=[1.0] * 7, suspend_after_lapse_count=1_000_000, historical_retention=0.9,
                learning_step_count=len(conf['new']['delays']), relearning_step_count=relearn_steps)
            res = col._backend.simulate_fsrs_review(req)
            sims[str(new)] = {'reviews': list(res.daily_review_count), 'newCards': list(res.daily_new_count)}

        out['groups'][gid] = {
            'params': params,
            'paramsOptimisedInPreset': bool(conf.get('fsrsParams6')),
            'states': states,
            'evaluation': {
                'presetParams': {'logLoss': current.log_loss, 'rmseBins': current.rmse_bins},
                'optimisedCrossValidated': {'logLoss': cross_validated.log_loss, 'rmseBins': cross_validated.rmse_bins},
                'optimisedInSample': {'logLoss': in_sample.log_loss, 'rmseBins': in_sample.rmse_bins},
            },
            'optimised': {'params': optimised, 'fsrsItems': opt.fsrs_items, 'healthCheckPassed': opt.health_check_passed},
            'simulator': sims,
        }
        print(f'{gid}: {len(states)} cards, {opt.fsrs_items} FSRS items', file=sys.stderr)
    col.close(downgrade=False)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w') as f:
        json.dump(out, f)
    print(f'Anki {version}: wrote {os.path.relpath(OUT, ROOT)}', file=sys.stderr)
finally:
    shutil.rmtree(work, ignore_errors=True)
