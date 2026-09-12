#!/usr/bin/env python3
"""Build Ytb, sharing the suite's signing lock."""
import fcntl,json,os,pathlib,shutil,subprocess,sys
root=pathlib.Path(__file__).resolve().parents[1]
if len(sys.argv)!=1: raise SystemExit('Ytb has one built-in source; no provider argument')
lockpath=pathlib.Path.home()/'Library/Caches/ios-app-refresh/signing.lock'
lockpath.parent.mkdir(parents=True,exist_ok=True)
with lockpath.open('a') as lock:
    inherited=os.environ.get('IOS_REFRESH_LOCK_FD')
    if inherited:
        expected=lockpath.stat();actual=os.fstat(int(inherited))
        if (actual.st_dev,actual.st_ino)!=(expected.st_dev,expected.st_ino): raise SystemExit('Invalid inherited signing lock')
    else: fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    source=root/'build'/'Web'
    destination=root/'Resources/Web';destination.mkdir(parents=True,exist_ok=True)
    for name in ['index.html','style.css','app.js']: shutil.copy2(source/name,destination/name)
    team=os.environ['DEVELOPMENT_TEAM'];device=os.environ['SIGNING_DEVICE']
    subprocess.run(['xcodebuild','-project','Ytb.xcodeproj','-scheme','Ytb','-configuration','Release',
        '-sdk','iphoneos','-destination','platform=iOS,id='+device,'-destination-timeout','30',
        'SYMROOT='+str(root/'build'/'native'),
        'DEVELOPMENT_TEAM='+team,'-allowProvisioningUpdates','-allowProvisioningDeviceRegistration','build'],cwd=root,check=True)
