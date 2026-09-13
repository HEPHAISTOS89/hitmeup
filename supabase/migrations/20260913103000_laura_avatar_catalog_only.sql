-- Make Laura's visual inventory the only active avatar catalogue without
-- deleting historical purchases, reward ledger rows, or entitlement records.
-- The previous frame/patch/motion rows remain as inactive audit references.

update public.avatar_cosmetic_catalog
set active = false
where sku in (
  'reward-frame-mint',
  'reward-frame-solar',
  'reward-patch-nearby',
  'reward-motion-drift',
  'profile-frame',
  'campus-theme',
  'trust-badge'
);

-- These legacy products are no longer quoteable. Existing verified receipts
-- and entitlements remain intact for audit/history purposes.
update public.avatar_solana_products
set active = false
where sku in ('profile-frame', 'campus-theme', 'trust-badge');

-- Earned items now come from Laura's accessory inventory. The server remains
-- the only source of price, ownership and equip truth.
update public.avatar_cosmetic_catalog
set unlock_method = 'reward_points',
    purchase_sku = null,
    lamports = 0,
    reward_points = case sku
      when 'avatar.accessory.beanie' then 40
      when 'avatar.accessory.bag' then 60
      when 'avatar.accessory.wallet' then 80
      when 'avatar.accessory.stars' then 80
    end,
    active = true
where sku in (
  'avatar.accessory.beanie',
  'avatar.accessory.bag',
  'avatar.accessory.wallet',
  'avatar.accessory.stars'
);
