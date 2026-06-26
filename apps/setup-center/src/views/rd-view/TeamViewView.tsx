import React from 'react';
import { RdViewThemeProvider } from '../../components/rd-view/theme';
import { TeamDashboardWithTheme } from '../../components/rd-view/TeamDashboardWithTheme';
import '../../components/rd-view/rd-view-shell.css';
import '../../components/rd-view/theme/theme.css';
import '../../components/rd-view/index.css';

export function TeamViewView({ synapseApiBase = '' }: { synapseApiBase?: string }) {
  return (
    <div className="rdViewRoot">
      <RdViewThemeProvider>
        <TeamDashboardWithTheme synapseApiBase={synapseApiBase} />
      </RdViewThemeProvider>
    </div>
  );
}
