// Copyright 2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';
import * as sinon from 'sinon';
import { BrowserWindow, MenuItem, Tray, nativeImage } from 'electron';
import * as path from 'path';

import { SystemTrayService } from '../../../app/SystemTrayService';

describe('SystemTrayService', () => {
  let sandbox: sinon.SinonSandbox;

  /**
   * Instantiating an Electron `Tray` has side-effects that we need to clean up. Make sure
   * to use `newService` instead of `new SystemTrayService` in these tests to ensure that
   * the tray is cleaned up.
   *
   * This only affects these tests, not the "real" code.
   */
  function newService(): SystemTrayService {
    const result = new SystemTrayService({
      messages: {
        hide: { message: 'Hide' },
        quit: { message: 'Quit' },
        show: { message: 'Show' },
        signalDesktop: { message: 'Signal' },
      },
    });
    servicesCreated.add(result);
    return result;
  }

  const servicesCreated = new Set<SystemTrayService>();

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();

    servicesCreated.forEach(service => {
      service._getTray()?.destroy();
    });
    servicesCreated.clear();
  });

  it("doesn't render a tray icon unless (1) we're enabled (2) there's a browser window", () => {
    const service = newService();
    assert.isUndefined(service._getTray());

    service.setEnabled(true);
    assert.isUndefined(service._getTray());

    service.setMainWindow(new BrowserWindow({ show: false }));
    assert.instanceOf(service._getTray(), Tray);

    service.setEnabled(false);
    assert.isUndefined(service._getTray());
  });

  it('renders a "Hide" button when the window is shown and a "Show" button when the window is hidden', () => {
    // We don't actually want to show a browser window. It's disruptive when you're
    //   running tests and can introduce test-only flakiness. We jump through some hoops
    //   to fake the behavior.
    let fakeIsVisible = false;
    const browserWindow = new BrowserWindow({ show: fakeIsVisible });
    sinon.stub(browserWindow, 'isVisible').callsFake(() => fakeIsVisible);
    sinon.stub(browserWindow, 'show').callsFake(() => {
      fakeIsVisible = true;
      browserWindow.emit('show');
    });
    sinon.stub(browserWindow, 'hide').callsFake(() => {
      fakeIsVisible = false;
      browserWindow.emit('hide');
    });

    const service = newService();
    service.setEnabled(true);
    service.setMainWindow(browserWindow);

    const tray = service._getTray();
    if (!tray) {
      throw new Error('Test setup failed: expected a tray');
    }

    // Ideally, there'd be something like `tray.getContextMenu`, but that doesn't exist.
    //   We also can't spy on `Tray.prototype.setContextMenu` because it's not defined
    //   that way. So we spy on the specific instance, just to get the context menu.
    const setContextMenuSpy = sandbox.spy(tray, 'setContextMenu');
    const getToggleMenuItem = (): undefined | null | MenuItem =>
      setContextMenuSpy.lastCall?.firstArg?.getMenuItemById(
        'toggleWindowVisibility'
      );

    browserWindow.show();
    assert.strictEqual(getToggleMenuItem()?.label, 'Hide');

    getToggleMenuItem()?.click();
    assert.strictEqual(getToggleMenuItem()?.label, 'Show');

    getToggleMenuItem()?.click();
    assert.strictEqual(getToggleMenuItem()?.label, 'Hide');
  });

  it('destroys the tray when disabling', () => {
    const service = newService();
    service.setEnabled(true);
    service.setMainWindow(new BrowserWindow({ show: false }));

    const tray = service._getTray();
    if (!tray) {
      throw new Error('Test setup failed: expected a tray');
    }

    assert.isFalse(tray.isDestroyed());

    service.setEnabled(false);

    assert.isTrue(tray.isDestroyed());
  });

  it('maintains the same Tray instance when switching browser window instances', () => {
    const service = newService();
    service.setEnabled(true);
    service.setMainWindow(new BrowserWindow({ show: false }));

    const originalTray = service._getTray();

    service.setMainWindow(new BrowserWindow({ show: false }));

    assert.strictEqual(service._getTray(), originalTray);
  });

  it('removes browser window event listeners when changing browser window instances', () => {
    const firstBrowserWindow = new BrowserWindow({ show: false });

    const showListenersAtStart = firstBrowserWindow.listenerCount('show');
    const hideListenersAtStart = firstBrowserWindow.listenerCount('hide');

    const service = newService();
    service.setEnabled(true);
    service.setMainWindow(firstBrowserWindow);

    assert.strictEqual(
      firstBrowserWindow.listenerCount('show'),
      showListenersAtStart + 1
    );
    assert.strictEqual(
      firstBrowserWindow.listenerCount('hide'),
      hideListenersAtStart + 1
    );

    service.setMainWindow(new BrowserWindow({ show: false }));

    assert.strictEqual(
      firstBrowserWindow.listenerCount('show'),
      showListenersAtStart
    );
    assert.strictEqual(
      firstBrowserWindow.listenerCount('hide'),
      hideListenersAtStart
    );
  });

  it('removes browser window event listeners when removing browser window instances', () => {
    const browserWindow = new BrowserWindow({ show: false });

    const showListenersAtStart = browserWindow.listenerCount('show');
    const hideListenersAtStart = browserWindow.listenerCount('hide');

    const service = newService();
    service.setEnabled(true);
    service.setMainWindow(browserWindow);

    assert.strictEqual(
      browserWindow.listenerCount('show'),
      showListenersAtStart + 1
    );
    assert.strictEqual(
      browserWindow.listenerCount('hide'),
      hideListenersAtStart + 1
    );

    service.setMainWindow(undefined);

    assert.strictEqual(
      browserWindow.listenerCount('show'),
      showListenersAtStart
    );
    assert.strictEqual(
      browserWindow.listenerCount('hide'),
      hideListenersAtStart
    );
  });

  it('updates the icon when the unread count changes', () => {
    const service = newService();
    service.setEnabled(true);
    service.setMainWindow(new BrowserWindow({ show: false }));

    const tray = service._getTray();
    if (!tray) {
      throw new Error('Test setup failed: expected a tray');
    }

    // Ideally, there'd be something like `tray.getImage`, but that doesn't exist. We also
    //   can't spy on `Tray.prototype.setImage` because it's not defined that way. So we
    //   spy on the specific instance, just to get the image.
    const setImageSpy = sandbox.spy(tray, 'setImage');
    const getImagePath = (): string => {
      const result = setImageSpy.lastCall?.firstArg;
      if (!result) {
        throw new Error('Expected tray.setImage to be called at least once');
      }
      return result;
    };

    for (let i = 9; i >= 1; i -= 1) {
      service.setUnreadCount(i);
      assert.strictEqual(path.parse(getImagePath()).base, `${i}.png`);
    }

    for (let i = 10; i < 13; i += 1) {
      service.setUnreadCount(i);
      assert.strictEqual(path.parse(getImagePath()).base, '10.png');
    }

    service.setUnreadCount(0);
    assert.match(path.parse(getImagePath()).base, /^icon_\d+\.png$/);
  });

  it('uses a fallback image if the icon file cannot be found', () => {
    const service = newService();
    service.setEnabled(true);
    service.setMainWindow(new BrowserWindow({ show: false }));

    const tray = service._getTray();
    if (!tray) {
      throw new Error('Test setup failed: expected a tray');
    }

    const setImageStub = sandbox.stub(tray, 'setImage');
    setImageStub.withArgs(sinon.match.string).throws('Failed to load');

    service.setUnreadCount(4);

    // Electron doesn't export this class, so we have to wrestle it out.
    const NativeImage = nativeImage.createEmpty().constructor;

    sinon.assert.calledTwice(setImageStub);
    sinon.assert.calledWith(setImageStub, sinon.match.string);
    sinon.assert.calledWith(setImageStub, sinon.match.instanceOf(NativeImage));
  });
});
