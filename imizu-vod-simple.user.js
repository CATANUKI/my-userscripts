// ==UserScript==
// @name         いみずVOD 古い順再生
// @namespace    https://github.com/CATANUKI/my-userscripts
// @version      1.0.0
// @description  一覧ページの動画を古い順に開き、次の動画へ進みます
// @match        https://imizu-vod.com/*
// @match        https://www.imizu-vod.com/*
// @match        http://imizu-vod.com/*
// @match        http://www.imizu-vod.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const LIST_KEY = 'imizuVodPlaylist';
  const INDEX_KEY = 'imizuVodPlaylistIndex';
  const PANEL_ID = 'imizuVodSimplePanel';

  function isVideoPage() {
    return /viddetail/i.test(location.href);
  }

  function getVideoId(url) {
    try {
      const parsed = new URL(url);
      return parsed.searchParams.get('id') || parsed.href;
    } catch {
      return url;
    }
  }

  function getVideoLinks() {
    const links = [];
    const usedIds = new Set();

    document.querySelectorAll('a[href]').forEach(function (link) {
      const href = link.getAttribute('href');

      if (!href || !/viddetail/i.test(href)) {
        return;
      }

      try {
        const url = new URL(href, location.href);
        const id = getVideoId(url.href);

        if (!usedIds.has(id)) {
          usedIds.add(id);
          links.push(url.href);
        }
      } catch {
        // 読み取れないリンクは無視
      }
    });

    return links;
  }

  function savePlaylist(playlist) {
    localStorage.setItem(LIST_KEY, JSON.stringify(playlist));
    localStorage.setItem(INDEX_KEY, '0');
  }

  function loadPlaylist() {
    try {
      const saved = localStorage.getItem(LIST_KEY);

      if (!saved) {
        return null;
      }

      const playlist = JSON.parse(saved);
      const index = Number(localStorage.getItem(INDEX_KEY) || '0');

      if (!Array.isArray(playlist) || playlist.length === 0) {
        return null;
      }

      return { playlist, index };
    } catch {
      return null;
    }
  }

  function stopPlaylist() {
    localStorage.removeItem(LIST_KEY);
    localStorage.removeItem(INDEX_KEY);
    document.getElementById(PANEL_ID)?.remove();
  }

  function syncCurrentIndex(data) {
    const currentId = getVideoId(location.href);

    const actualIndex = data.playlist.findIndex(function (url) {
      return getVideoId(url) === currentId;
    });

    if (actualIndex >= 0 && actualIndex !== data.index) {
      data.index = actualIndex;
      localStorage.setItem(INDEX_KEY, String(actualIndex));
    }

    return data;
  }

  function goToNextVideo() {
    const data = loadPlaylist();

    if (!data) {
      alert('再生リストがありません。一覧ページから開始してください。');
      return;
    }

    syncCurrentIndex(data);

    const nextIndex = data.index + 1;

    if (nextIndex >= data.playlist.length) {
      alert('このページの動画をすべて見終わりました。');
      stopPlaylist();
      return;
    }

    localStorage.setItem(INDEX_KEY, String(nextIndex));
    location.href = data.playlist[nextIndex];
  }

  function startOldestFirst() {
    const links = getVideoLinks();

    if (links.length === 0) {
      alert('動画リンクを取得できませんでした。');
      return;
    }

    /*
     * 一覧が新しい順なので、順番を反転します。
     * 対象は現在表示している一覧ページ内の動画だけです。
     */
    links.reverse();

    savePlaylist(links);
    location.href = links[0];
  }

  function createPanel(title) {
    document.getElementById(PANEL_ID)?.remove();

    const panel = document.createElement('div');
    panel.id = PANEL_ID;

    panel.style.cssText = [
      'position:fixed',
      'right:12px',
      'bottom:12px',
      'z-index:2147483647',
      'width:min(280px,calc(100vw - 24px))',
      'padding:12px',
      'border:1px solid #888',
      'border-radius:12px',
      'background:rgba(255,255,255,0.97)',
      'color:#222',
      'box-shadow:0 4px 16px rgba(0,0,0,0.25)',
      'font-family:-apple-system,BlinkMacSystemFont,sans-serif',
      'font-size:14px'
    ].join(';');

    const heading = document.createElement('div');
    heading.textContent = title;
    heading.style.cssText =
      'font-size:16px;font-weight:700;margin-bottom:6px';

    panel.appendChild(heading);
    document.body.appendChild(panel);

    return panel;
  }

  function addText(panel, text) {
    const element = document.createElement('div');
    element.textContent = text;
    element.style.cssText = 'margin:6px 0;line-height:1.45';
    panel.appendChild(element);
  }

  function addButton(panel, text, action, secondary) {
    const button = document.createElement('button');

    button.type = 'button';
    button.textContent = text;
    button.style.cssText = [
      'display:block',
      'width:100%',
      'margin-top:8px',
      'padding:12px',
      'border:0',
      'border-radius:8px',
      'background:' + (secondary ? '#666' : '#0878b9'),
      'color:#fff',
      'font-size:16px',
      'font-weight:700',
      '-webkit-appearance:none'
    ].join(';');

    button.addEventListener('click', action);
    panel.appendChild(button);
  }

  function connectVideoEnd(panel) {
    let connected = false;

    function attach() {
      document.querySelectorAll('video').forEach(function (video) {
        if (video.dataset.imizuConnected === '1') {
          return;
        }

        video.dataset.imizuConnected = '1';
        connected = true;

        video.addEventListener(
          'ended',
          function () {
            goToNextVideo();
          },
          { once: true }
        );
      });
    }

    attach();

    const observer = new MutationObserver(attach);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });

    setTimeout(function () {
      if (!connected) {
        addText(
          panel,
          '動画終了を自動検知できない場合は、視聴後に「次の動画へ」を押してください。'
        );
      }
    }, 5000);
  }

  function showListPanel() {
    const links = getVideoLinks();

    if (links.length === 0) {
      return;
    }

    const panel = createPanel('いみずVOD 古い順再生');

    addText(
      panel,
      '現在のページにある動画' +
        links.length +
        '本を、古い動画から順番に開きます。'
    );

    addButton(panel, '古い順に再生する', startOldestFirst, false);
  }

  function showVideoPanel() {
    let data = loadPlaylist();

    if (!data) {
      return;
    }

    data = syncCurrentIndex(data);

    const panel = createPanel('いみずVOD 再生リスト');

    addText(
      panel,
      String(data.index + 1) +
        '本目／全' +
        String(data.playlist.length) +
        '本'
    );

    if (data.index + 1 < data.playlist.length) {
      addButton(panel, '次の動画へ', goToNextVideo, false);
    } else {
      addText(panel, 'この動画が再生リストの最後です。');
    }

    addButton(panel, '連続再生を停止', stopPlaylist, true);
    connectVideoEnd(panel);
  }

  if (isVideoPage()) {
    showVideoPanel();
  } else {
    showListPanel();
  }
})();
