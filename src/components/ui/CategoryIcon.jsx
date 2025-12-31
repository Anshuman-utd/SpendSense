import { 
  ShoppingBagIcon, 
  TruckIcon, 
  FilmIcon, 
  CakeIcon, 
  HeartIcon, 
  AcademicCapIcon, 
  BriefcaseIcon, 
  BanknotesIcon, 
  QuestionMarkCircleIcon 
} from '@heroicons/react/24/outline';

const categoryConfig = {
  Shopping: { icon: ShoppingBagIcon, color: 'text-pink-500', bg: 'bg-pink-500/10' },
  Food: { icon: CakeIcon, color: 'text-orange-500', bg: 'bg-orange-500/10' },
  Transport: { icon: TruckIcon, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  Entertainment: { icon: FilmIcon, color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
  Utilities: { icon: BanknotesIcon, color: 'text-cyan-500', bg: 'bg-cyan-500/10' },
  Health: { icon: HeartIcon, color: 'text-red-500', bg: 'bg-red-500/10' },
  Education: { icon: AcademicCapIcon, color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
  Work: { icon: BriefcaseIcon, color: 'text-purple-500', bg: 'bg-purple-500/10' },
  Other: { icon: QuestionMarkCircleIcon, color: 'text-zinc-500', bg: 'bg-zinc-500/10' },
};

export default function CategoryIcon({ category }) {
  const config = categoryConfig[category] || categoryConfig['Other'];
  const Icon = config.icon;

  return (
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${config.bg} ${config.color}`}>
      <Icon className="w-5 h-5" />
    </div>
  );
}

export function getCategoryStyle(category) {
    const config = categoryConfig[category] || categoryConfig['Other'];
    return {
        bg: config.bg,
        text: config.color
    };
}
