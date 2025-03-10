package com.edr.flink.detection;

import com.edr.flink.model.Detection;
import com.edr.flink.model.Event;
import org.apache.flink.cep.PatternSelectFunction;
import org.apache.flink.cep.pattern.Pattern;

/**
 * Interface for detection rules
 */
public interface DetectionRule {
    /**
     * Gets a unique identifier for this rule
     */
    String getRuleId();
    
    /**
     * Gets the severity level of this rule (1-5)
     */
    int getSeverity();
    
    /**
     * Gets a human-readable description of this detection rule
     */
    String getDescription();
    
    /**
     * Defines the CEP pattern for this detection rule
     */
    Pattern<Event, ?> definePattern();
    
    /**
     * Handles a pattern match by creating a detection
     */
    PatternSelectFunction<Event, Detection> getPatternSelectFunction();
} 