#!/bin/bash
cd "/Users/marius/antigravity/Money Scanner/apps/api" || exit 1
npm run build > /tmp/ms-build.log 2>&1 || { echo BUILD_FAIL > /tmp/ms-test.done; exit 1; }
node --test 'dist/**/*.test.js' > /tmp/ms-test.log 2>&1
echo $? > /tmp/ms-test.done
