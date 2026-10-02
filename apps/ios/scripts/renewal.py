#!/usr/bin/env python3
"""Print this repo's paid app for its renewal scheduler (ios-tools renewal; runs on the Mac mirror)."""
import argparse
import json
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--team', required=True)
parser.add_argument('--device', required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
# Single-source app: no provider argument.
print(json.dumps(dict(repo='km-explorer', apps=[dict(name='ytb', root=str(root), app='build/native/Release-iphoneos/Ytb.app',
                       bundleIds=['com.visar.Ytb.paid'],
                       inputs=['Ytb', 'Ytb.xcodeproj', 'Resources/Info.plist', 'Resources/LocalCA.cer',
                               'build/Web', 'scripts/build.sh', 'scripts/build-native.py'],
                       build=['/bin/bash', 'scripts/build.sh'],
                       environment={'DEVELOPMENT_TEAM': args.team, 'SIGNING_DEVICE': args.device})])))
