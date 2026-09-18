import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ClipboardList,
  Stethoscope,
  Pill,
  CalendarCheck,
  HeartPulse,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

export default function PatientHistory() {
  const {
    data: consultations = [],
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['patient-emr-mine'],
    queryFn: async () => {
      const res = await api.get('/api/consultations/mine');
      return res.data;
    },
  });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-2.5">
            <ClipboardList className="h-7 w-7 text-primary" />
            Medical History &amp; EMR
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Read-only chronological timeline of clinical consultations, diagnoses, vitals, and prescribed medications.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isRefetching}
          className="h-9 px-3 text-muted-foreground hover:text-foreground text-xs self-start sm:self-auto"
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isRefetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Main EMR Timeline Container */}
      <Card className="border-border bg-card shadow-soft overflow-hidden">
        <CardHeader className="border-b border-border/60 bg-muted/20 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold text-foreground">
                Clinical Consultations Timeline
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Official electronic health records entered by attending medical doctors
              </CardDescription>
            </div>
            <div className="text-xs text-muted-foreground font-medium">
              Total Records: <span className="font-bold text-foreground">{consultations.length}</span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-6">
          {isLoading ? (
            <div className="space-y-4 py-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse space-y-2 p-5 rounded-2xl border border-border bg-muted/20">
                  <div className="h-3 w-32 bg-muted rounded" />
                  <div className="h-4 w-48 bg-muted/80 rounded" />
                  <div className="h-3 w-full bg-muted/60 rounded" />
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="py-12 text-center text-xs text-destructive">
              <AlertCircle className="h-8 w-8 mx-auto mb-2 text-destructive" />
              <h3 className="text-sm font-bold text-foreground">Could not load medical history</h3>
              <p className="text-muted-foreground mt-1 mb-4">
                {error?.response?.data?.message || 'Server error while fetching your medical records.'}
              </p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Try Again
              </Button>
            </div>
          ) : consultations.length === 0 ? (
            <div className="py-12 sm:py-16 text-center">
              <div className="h-14 w-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-3">
                <ClipboardList className="h-7 w-7" />
              </div>
              <h3 className="text-base font-bold text-foreground">No medical history records yet</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                Consultations and prescriptions recorded by doctors at the hospital will appear on this timeline.
              </p>
            </div>
          ) : (
            <div className="space-y-4 pr-1">
              {consultations.map((c) => (
                <div
                  key={c._id}
                  className="relative pl-5 border-l-2 border-primary/40 space-y-3 pb-2"
                >
                  {/* Timeline dot */}
                  <div className="absolute -left-[6px] top-1.5 h-3 w-3 rounded-full bg-primary ring-4 ring-card shadow-sm" />

                  {/* Consultation Card - reusing exact same card design from Prompt 9 EMR tab */}
                  <div className="p-4 sm:p-5 rounded-2xl border border-border bg-muted/15 space-y-3.5 shadow-soft-sm hover:border-border/80 transition-all">
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                          {new Date(c.createdAt).toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                        {c.doctorId?.name && (
                          <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5 font-medium">
                            <Stethoscope className="h-3.5 w-3.5 text-primary" />
                            Dr. {c.doctorId.name}
                            {c.doctorId.department && (
                              <span className="text-muted-foreground/70">· {c.doctorId.department}</span>
                            )}
                          </div>
                        )}
                      </div>

                      {c.followUpDate && (
                        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-primary bg-primary/10 border border-primary/20 px-2.5 py-1 rounded-full shrink-0 self-start">
                          <CalendarCheck className="h-3.5 w-3.5" />
                          Follow-up: {new Date(c.followUpDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      )}
                    </div>

                    {/* Diagnosis */}
                    <div>
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                        Diagnosis
                      </span>
                      <p className="text-sm sm:text-base font-bold text-foreground mt-0.5">{c.diagnosis}</p>
                    </div>

                    {/* Symptoms */}
                    {c.symptoms && (
                      <div>
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                          Symptoms
                        </span>
                        <p className="text-xs text-foreground mt-0.5">{c.symptoms}</p>
                      </div>
                    )}

                    {/* Vitals */}
                    {c.vitals && Object.values(c.vitals).some(Boolean) && (
                      <div>
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                          <HeartPulse className="h-3 w-3 text-primary" /> Vitals Recorded
                        </span>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {c.vitals.bloodPressure && (
                            <span className="text-[10px] bg-card border border-border px-2.5 py-1 rounded-full font-medium text-foreground">
                              BP: {c.vitals.bloodPressure}
                            </span>
                          )}
                          {c.vitals.temperature && (
                            <span className="text-[10px] bg-card border border-border px-2.5 py-1 rounded-full font-medium text-foreground">
                              Temp: {c.vitals.temperature}
                            </span>
                          )}
                          {c.vitals.pulse && (
                            <span className="text-[10px] bg-card border border-border px-2.5 py-1 rounded-full font-medium text-foreground">
                              Pulse: {c.vitals.pulse}
                            </span>
                          )}
                          {c.vitals.weight && (
                            <span className="text-[10px] bg-card border border-border px-2.5 py-1 rounded-full font-medium text-foreground">
                              Wt: {c.vitals.weight}
                            </span>
                          )}
                          {c.vitals.height && (
                            <span className="text-[10px] bg-card border border-border px-2.5 py-1 rounded-full font-medium text-foreground">
                              Ht: {c.vitals.height}
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Prescriptions */}
                    {c.prescriptions && c.prescriptions.length > 0 && (
                      <div>
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                          <Pill className="h-3 w-3 text-primary" /> Prescriptions
                        </span>
                        <div className="mt-1.5 space-y-1 bg-card/60 rounded-xl p-2.5 border border-border/40">
                          {c.prescriptions.map((rx, ri) => (
                            <div key={ri} className="text-xs text-foreground flex items-baseline gap-2 flex-wrap">
                              <span className="font-bold text-primary">{rx.medicineName}</span>
                              {rx.dosage && <span className="text-muted-foreground">({rx.dosage})</span>}
                              {rx.frequency && <span className="text-muted-foreground">· {rx.frequency}</span>}
                              {rx.duration && <span className="text-muted-foreground">· for {rx.duration}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Notes */}
                    {c.notes && (
                      <div className="text-xs text-muted-foreground italic border-t border-border/50 pt-2.5">
                        <span className="font-semibold text-foreground/70 not-italic">Doctor's Clinical Notes:</span> {c.notes}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
