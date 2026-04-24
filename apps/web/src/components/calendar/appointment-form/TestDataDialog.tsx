import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

// ─── Types ────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TestAppointmentData = Record<string, any>;

type TestDataDialogProps = {
	data: TestAppointmentData;
	onClose: () => void;
	onConfirm: (data: TestAppointmentData) => void;
};

// ─── Component ────────────────────────────────────────────────────────────────

export function TestDataDialog({ data, onClose, onConfirm }: TestDataDialogProps) {
	return (
		<div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[10001] p-4">
			<Card className="w-full max-w-4xl max-h-[90vh] overflow-hidden bg-white shadow-2xl">
				<CardContent className="p-6">
					<div className="flex items-center justify-between mb-4">
						<h3 className="text-lg font-semibold text-brand-primary-1">
							🧪 Test Data - {data.type}
						</h3>
						<div className="flex gap-2">
							<Button
								variant="outline"
								size="sm"
								onClick={onClose}
								className="border-brand-secondary-3 text-brand-primary-1 hover:bg-brand-secondary-3/50"
							>
								Close
							</Button>
							<Button
								size="sm"
								onClick={() => onConfirm(data)}
								className="bg-green-600 hover:bg-green-700 text-white"
							>
								Confirm & Submit
							</Button>
						</div>
					</div>

					<div className="space-y-4 max-h-[70vh] overflow-y-auto">
						{/* Appointment Object */}
						<div className="space-y-2">
							<h4 className="text-sm font-semibold text-brand-primary-1">📋 Appointment Object:</h4>
							<div className="bg-brand-secondary-3/50 p-3 rounded-lg border">
								<pre className="text-xs text-brand-primary-1 whitespace-pre-wrap">
									{JSON.stringify(data.appointment || data.appointments, null, 2)}
								</pre>
							</div>
						</div>

						{/* Client Details */}
						{data.clientDetails && (
							<div className="space-y-2">
								<h4 className="text-sm font-semibold text-brand-primary-1">👤 Client Details:</h4>
								<div className="bg-blue-50 p-3 rounded-lg border">
									<pre className="text-xs text-brand-primary-1 whitespace-pre-wrap">
										{JSON.stringify(data.clientDetails, null, 2)}
									</pre>
								</div>
							</div>
						)}

						{/* Service Details */}
						{data.serviceDetails && (
							<div className="space-y-2">
								<h4 className="text-sm font-semibold text-brand-primary-1">🔧 Service Details:</h4>
								<div className="bg-green-50 p-3 rounded-lg border">
									<pre className="text-xs text-brand-primary-1 whitespace-pre-wrap">
										{JSON.stringify(data.serviceDetails, null, 2)}
									</pre>
								</div>
							</div>
						)}

						{/* Form Data */}
						{data.formData && (
							<div className="space-y-2">
								<h4 className="text-sm font-semibold text-brand-primary-1">📝 Form Data:</h4>
								<div className="bg-yellow-50 p-3 rounded-lg border">
									<pre className="text-xs text-brand-primary-1 whitespace-pre-wrap">
										{JSON.stringify(data.formData, null, 2)}
									</pre>
								</div>
							</div>
						)}

						{/* Calculated Values */}
						{data.calculatedValues && (
							<div className="space-y-2">
								<h4 className="text-sm font-semibold text-brand-primary-1">⚡ Calculated Values:</h4>
								<div className="bg-purple-50 p-3 rounded-lg border">
									<pre className="text-xs text-brand-primary-1 whitespace-pre-wrap">
										{JSON.stringify(data.calculatedValues, null, 2)}
									</pre>
								</div>
							</div>
						)}

						{/* Multiple Appointments Slot Details */}
						{data.type === "MULTIPLE APPOINTMENTS" && data.appointments && (
							<div className="space-y-2">
								<h4 className="text-sm font-semibold text-brand-primary-1">📊 Multiple Appointments Slots:</h4>
								<div className="space-y-3">
									{/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
									{data.appointments.map((appointment: any, index: number) => (
										<div key={index} className="bg-orange-50 p-3 rounded-lg border">
											<div className="text-sm font-medium text-brand-primary-1 mb-2">
												Slot {index + 1}: {appointment.title}
											</div>
											<div className="grid grid-cols-2 gap-2 text-xs text-brand-secondary-1">
												<div><strong>Date:</strong> {appointment.start ? new Date(appointment.start).toLocaleDateString("en-US") : "N/A"}</div>
												<div><strong>Time:</strong> {appointment.start ? new Date(appointment.start).toLocaleTimeString("en-US") : "N/A"}</div>
												<div><strong>Duration:</strong> {appointment.duration} minutes</div>
												<div><strong>Services:</strong> {appointment.service}</div>
												<div><strong>Assigned To:</strong> {appointment.assignedTo?.name || "Unassigned"}</div>
												<div><strong>Remarks:</strong> {appointment.remarks || "None"}</div>
											</div>
											{appointment.recurrence && appointment.recurrence !== "none" && (
												<div className="mt-2 text-xs text-brand-secondary-1">
													<strong>Recurrence:</strong> {appointment.recurrence}
													{appointment.customRecurrence && (
														<div className="ml-2">
															<div>Frequency: Every {appointment.customRecurrence.frequency} {appointment.customRecurrence.timeUnit}</div>
															{appointment.customRecurrence.repeatOn && appointment.customRecurrence.repeatOn.length > 0 && (
																<div>Repeat on: {appointment.customRecurrence.repeatOn.join(", ")}</div>
															)}
															{appointment.customRecurrence.endsType && (
																<div>Ends: {appointment.customRecurrence.endsType === "on"
																	? `On ${appointment.customRecurrence.endsDate}`
																	: `After ${appointment.customRecurrence.endsOccurrences} occurrences`
																}</div>
															)}
														</div>
													)}
												</div>
											)}
										</div>
									))}
								</div>
								<div className="bg-blue-50 p-3 rounded-lg border">
									<div className="text-sm text-brand-primary-1">
										<p><strong>Total Appointments:</strong> {data.totalCount}</p>
										<p><strong>Client ID:</strong> {data.clientId}</p>
									</div>
								</div>
							</div>
						)}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
