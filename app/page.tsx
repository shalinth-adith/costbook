import { redirect } from 'next/navigation';

export default function Home() {
  // The cost sheet is the product. Everything else is packaging.
  redirect('/recipes/plate');
}
