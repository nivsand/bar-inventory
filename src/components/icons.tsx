import {
  LayoutGrid, ClipboardCheck, ChefHat, Package, BookOpen, Tags, MapPin,
  ShoppingCart, Truck, Building2, Trash2, BarChart3, ScrollText, UserCircle,
  Martini, Search, Bell, LogOut, Languages, Menu, X, Plus, Minus,
} from "lucide-react";
import type { TKey } from "@/lib/i18n/translations";

/** Semantic icon per nav item, keyed by the same translation key used for its label. */
export const NAV_ICONS: Partial<Record<TKey, React.ComponentType<{ className?: string }>>> = {
  dashboard: LayoutGrid,
  dailyCount: ClipboardCheck,
  prep: ChefHat,
  inventory: Package,
  recipes: BookOpen,
  categories: Tags,
  locations: MapPin,
  orders: ShoppingCart,
  deliveries: Truck,
  suppliers: Building2,
  waste: Trash2,
  reports: BarChart3,
  audit: ScrollText,
  account: UserCircle,
};

export {
  Martini as BrandIcon, Search as SearchIcon, Bell as BellIcon, LogOut as LogOutIcon,
  Languages as LanguagesIcon, Menu as MenuIcon, X as CloseIcon, Plus as PlusIcon, Minus as MinusIcon,
};
