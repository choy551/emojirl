import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ShopModal } from '../components/ShopModal';
import { MobileHandContext } from '../components/mobile/oneHandedLayout';
import type { EmojiItem, GameState, Player } from './types';

function player(): Player {
  return {
    pos: { x: 1, y: 1 },
    emoji: '🧙',
    characterClass: '🧙',
    ammo: 0,
    stats: {
      hp: 10, maxHp: 10, attack: 2, defense: 0, speed: 1, evasion: 0,
      luck: 0, level: 1, xp: 0, moodValue: 0, gold: 80,
    },
    inventory: [],
    bank: [],
    equipment: {},
  };
}

function stockItem(partial: Partial<EmojiItem> & Pick<EmojiItem, 'id' | 'emoji' | 'name'>): EmojiItem {
  return { description: '', consumed: false, ...partial };
}

function sheet(stock: EmojiItem[], hand: 'left' | 'right' | null) {
  const gameState = {
    player: player(),
    currentFloor: 1,
    shopStock: stock,
    map: [[{ type: 'floor', emoji: '⬜', seen: true, visible: true }]],
    enemies: [],
    turn: 1,
  } as unknown as GameState;
  const modal = createElement(ShopModal, {
    gameState,
    setGameState: () => {},
    shopItems: stock,
    setShopItems: () => {},
    addLog: () => {},
    onBuyAndUse: () => false,
    onClose: () => {},
  });
  const tree = hand ? createElement(MobileHandContext.Provider, { value: hand }, modal) : modal;
  return renderToStaticMarkup(tree);
}

describe('shop Pickaxe', () => {
  const pickaxe = stockItem({
    id: 'pk', emoji: '⛏️', name: 'Pickaxe', activeKind: 'pickaxe', charges: 5,
  });
  const apple = stockItem({ id: 'ap', emoji: '🍎', name: 'Apple', healAmount: 4 });

  it('hides Buy & Use on desktop and on the one-handed shop, and keeps the price button', () => {
    for (const hand of [null, 'right'] as const) {
      const html = sheet([pickaxe], hand);
      expect(html).toContain('Pickaxe');
      expect(html).toContain('g');
      expect(html).not.toContain('data-testid="shop-buy-and-use"');
      expect(html).not.toContain('&amp; Use');
    }
    const withApple = sheet([pickaxe, apple], null);
    expect(withApple).toContain('data-testid="shop-buy-and-use"');
    expect(withApple.match(/data-testid="shop-buy-and-use"/g)).toHaveLength(1);
  });
});
