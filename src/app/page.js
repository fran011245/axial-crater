import Header from '@/components/Header';
import Footer from '@/components/Footer';
import StatusHero from '@/components/StatusHero';
import MovementsTable from '@/components/MovementsTable';
import ActivityChart from '@/components/ActivityChart';

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <StatusHero />
        <ActivityChart />
        <MovementsTable />
      </main>
      <Footer />
    </>
  );
}
