// Copyright 2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import React from 'react';
import { action } from '@storybook/addon-actions';
import { storiesOf } from '@storybook/react';

import enMessages from '../../_locales/en/messages.json';
import { DebugLogWindow, PropsType } from './DebugLogWindow';
import { setupI18n } from '../util/setupI18n';
import { sleep } from '../util/sleep';

const i18n = setupI18n('en', enMessages);

const createProps = (): PropsType => ({
  closeWindow: action('closeWindow'),
  downloadLog: action('downloadLog'),
  i18n,
  fetchLogs: () => {
    action('fetchLogs')();
    return Promise.resolve('Sample logs');
  },
  uploadLogs: async (logs: string) => {
    action('uploadLogs')(logs);
    await sleep(5000);
    return 'https://picsum.photos/1800/900';
  },
});

const story = storiesOf('Components/DebugLogWindow', module);

story.add('DebugLogWindow', () => <DebugLogWindow {...createProps()} />);
