/**
 * UniEventLogoExample - Usage Examples
 * Demonstrates all the ways to use the UniEvent Logo components
 */

import UniEventLogo from './UniEventLogo';
import UniEventText from './UniEventText';
import UniEventBrand from './UniEventBrand';
import UniEventLogoWrapper from './UniEventLogoWrapper';

export default function UniEventLogoExample() {
  return (
    <div className="p-8 space-y-8 bg-[#0D0D19]">
      
      {/* 1. Logo Only - UniEventLogo */}
      <section>
        <h2 className="text-white font-bold mb-4">1. Logo Only (UniEventLogo)</h2>
        <div className="flex gap-4 items-center">
          <UniEventLogo width={40} height={40} />
          <UniEventLogo width={60} height={60} />
          <UniEventLogo width={80} height={80} />
        </div>
      </section>

      {/* 2. Text Only - UniEventText */}
      <section>
        <h2 className="text-white font-bold mb-4">2. Text Only (UniEventText)</h2>
        <div className="flex gap-4 items-center">
          <UniEventText width={140} height={30} />
          <UniEventText width={210} height={45} />
          <UniEventText width={280} height={60} />
        </div>
      </section>

      {/* 3. Brand Combo - UniEventBrand */}
      <section>
        <h2 className="text-white font-bold mb-4">3. Brand Combo (UniEventBrand)</h2>
        <div className="space-y-4">
          <UniEventBrand size="small" />
          <UniEventBrand size="medium" />
          <UniEventBrand size="large" />
          <UniEventBrand size="medium" showText={false} />
        </div>
      </section>

      {/* 4. Wrapped Variants - UniEventLogoWrapper */}
      <section>
        <h2 className="text-white font-bold mb-4">4. Wrapped Variants (UniEventLogoWrapper)</h2>
        <div className="flex flex-wrap gap-4">
          <UniEventLogoWrapper size="small" variant="default" />
          <UniEventLogoWrapper size="medium" variant="card" />
          <UniEventLogoWrapper size="large" variant="gradient" />
          <UniEventLogoWrapper size="medium" variant="card" showText={false} />
        </div>
      </section>

    </div>
  );
}
