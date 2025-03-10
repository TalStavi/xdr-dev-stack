package com.edr.flink.detection;

import com.edr.flink.model.Detection;
import com.edr.flink.model.Event;

import java.util.List;
import java.util.UUID;

/**
 * Utility methods for working with detections
 */
public class DetectionUtils {
    
    /**
     * Create a new detection instance
     */
    public static Detection createDetection(String ruleId, int severity, String endpointId, 
                                         String description, List<Event> events) {
        Detection d = new Detection();
        d.setId(UUID.randomUUID().toString());
        d.setTimestamp(System.currentTimeMillis());
        d.setRuleId(ruleId);
        d.setSeverity(severity);
        d.setEndpointId(endpointId);
        d.setDescription(description);

        // Collect event IDs
        StringBuilder eventIds = new StringBuilder();
        for (int i = 0; i < events.size(); i++) {
            eventIds.append(events.get(i).getId());
            if (i < events.size() - 1) {
                eventIds.append(",");
            }
        }
        d.setEventIds(eventIds.toString());
        
        return d;
    }
    
    /**
     * Check if a process name is in the list of suspicious processes
     */
    public static boolean isSuspiciousProcess(String processName) {
        // In production, this would check against a list of suspicious processes
        String[] suspiciousProcesses = {"mimikatz", "psexec", "powershell.exe", "cmd.exe", "rundll32.exe"};
        for (String p : suspiciousProcesses) {
            if (processName != null && processName.toLowerCase().contains(p.toLowerCase())) {
                return true;
            }
        }
        return false;
    }
} 