"use client";

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Check, Circle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { setSetupChecklistDismissed } from '@/app/(dashboard)/requests/setup-actions';
import type { SetupCapability, WorkspaceSetup } from '@/lib/db/queries/setup';

const capabilityLabels: Record<SetupCapability['state'], string> = {
  READY: 'Ready',
  NOT_CONFIGURED: 'Not configured',
  UNSUPPORTED: 'Unsupported',
  ERROR: 'Error',
};

export function SetupChecklist({
  setup,
  capabilities,
}: {
  setup: WorkspaceSetup;
  capabilities: SetupCapability[];
}) {
  const [dismissed, setDismissed] = useState(setup.dismissed);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const completed = Object.values(setup.items).filter(Boolean).length;
  const isAdmin = setup.role === 'ADMIN';

  function persist(nextDismissed: boolean) {
    setError('');
    startTransition(async () => {
      const result = await setSetupChecklistDismissed(nextDismissed);
      if (!result.success) {
        setError(result.error ?? 'Unable to update the setup checklist.');
        return;
      }
      setDismissed(nextDismissed);
    });
  }

  if (dismissed) {
    return (
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div>
            <p className="font-medium">Setup checklist is hidden.</p>
            <p className="text-sm text-muted-foreground">Your {completed} of 4 completed steps are still tracked.</p>
          </div>
          <Button variant="outline" disabled={pending} onClick={() => persist(false)}>
            {pending ? 'Resuming…' : 'Resume setup checklist'}
          </Button>
          {error && <p role="alert" className="w-full text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>
    );
  }

  const items = [
    {
      key: 'workspace',
      complete: setup.items.workspaceNamed,
      title: 'Name your workspace',
      description: 'Confirm the workspace name your team will recognize.',
      adminLinks: [{ href: '/settings#organization', label: 'Open organization settings' }],
    },
    {
      key: 'collaborators',
      complete: setup.items.collaboratorsAdded,
      title: 'Invite a teammate',
      description: 'A current teammate or active invitation completes this step.',
      adminLinks: [{ href: '/settings#members', label: 'Open member settings' }],
    },
    {
      key: 'context',
      complete: setup.items.contextAdded,
      title: 'Add product context',
      description: 'Connect a repository or add an active OKR. Both are optional ways to give work useful context.',
      adminLinks: [
        { href: '/settings#repositories', label: 'Open repository settings' },
        { href: '/settings#okrs', label: 'Open OKR settings' },
      ],
    },
    {
      key: 'request',
      complete: setup.items.firstRequestCreated,
      title: 'Create the first request',
      description: 'Start with a real request when your team is ready. No sample data is created automatically.',
      links: [{ href: '/requests/new', label: 'Create a request' }],
    },
  ];

  return (
    <Card role="region" aria-labelledby="workspace-setup-title">
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle id="workspace-setup-title">Set up this workspace</CardTitle>
          <p className="text-sm text-muted-foreground">{completed} of 4 complete</p>
        </div>
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => persist(true)}>
          {pending ? 'Dismissing…' : 'Dismiss setup checklist'}
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <ol className="grid gap-3 md:grid-cols-2">
          {items.map((item) => (
            <li key={item.key} className="rounded-md border p-4">
              <div className="flex items-start gap-3">
                {item.complete
                  ? <Check aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-green-600" />
                  : <Circle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />}
                <span className="sr-only">{item.complete ? 'Complete' : 'Not complete'}</span>
                <div className="min-w-0 space-y-2">
                  <div>
                    <p className="font-medium">{item.title}</p>
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                    {item.links?.map((link) => <Link key={link.href} className="underline" href={link.href}>{link.label}</Link>)}
                    {item.adminLinks && isAdmin && item.adminLinks.map((link) => (
                      <Link key={link.href} className="underline" href={link.href}>{link.label}</Link>
                    ))}
                    {item.adminLinks && !isAdmin && !item.complete && (
                      <span className="text-muted-foreground">Ask a workspace administrator to complete this step.</span>
                    )}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ol>

        <section aria-labelledby="optional-capabilities-title" className="space-y-3 border-t pt-5">
          <div>
            <h3 id="optional-capabilities-title" className="font-medium">Optional capabilities</h3>
            <p className="text-sm text-muted-foreground">These integrations are optional. Configure only the ones your team plans to use.</p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {capabilities.map((capability) => (
              <li key={capability.key} className="rounded-md bg-muted/40 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{capability.label}</p>
                  <span className="rounded-full border px-2 py-0.5 text-xs">{capabilityLabels[capability.state]}</span>
                </div>
                <p className="mt-1 text-muted-foreground">{capability.message}</p>
                {capability.href && (!capability.adminOnly || isAdmin) && (
                  <Link className="mt-2 inline-block underline" href={capability.href}>
                    Open {capability.label} settings
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      </CardContent>
    </Card>
  );
}
