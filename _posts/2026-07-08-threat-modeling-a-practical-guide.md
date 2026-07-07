---
layout: post
title: "Threat Modeling: A Practical Guide to STRIDE and Beyond"
date: 2026-07-08 14:00:00 +0530
tags: [threat-modeling, stride, appsec, security]
excerpt: "How to start threat modeling, a comparison of the major methodologies, a deep dive into STRIDE with edge cases and ten worked examples, and how to move from threats to risk."
---

Threat modeling is one of the highest-leverage activities in application security —
done well, it catches design flaws before a single line of vulnerable code ships.
This is my working reference: how to start, which methodology to reach for, and a
deep dive into STRIDE with the edge cases that actually trip people up.

## How to Start Threat Modeling

![Six-step threat modeling process](/assets/img/tm-process.svg)

1. **Define the System Scope**
   - Identify what you're protecting (assets, data, functionality)
   - Understand the system boundaries
   - Document the architecture and data flows
2. **Create System Models**
   - Data Flow Diagrams (DFDs)
   - Architecture diagrams
   - Trust boundaries identification
3. **Choose Your Methodology**
   - Based on your context, team expertise, and objectives
4. **Identify Threats**
   - Systematically go through each component
   - Consider attack vectors and threat actors
5. **Assess and Prioritize**
   - Evaluate likelihood and impact
   - Prioritize based on risk
6. **Define Mitigations**
   - Security controls and countermeasures
   - Residual risk acceptance

## Threat Modeling Methodologies Comparison

### STRIDE (Microsoft)

**Best for:** Application-level security, systematic coverage
**Strengths:** Comprehensive, well-documented, easy to learn
**Weaknesses:** Can be overwhelming for large systems, doesn't prioritize by default

### PASTA (Process for Attack Simulation and Threat Analysis)

**Best for:** Risk-centric analysis, business alignment
**Strengths:** Business-focused, considers attacker perspective
**Weaknesses:** More complex, requires more resources

### OCTAVE (Operationally Critical Threat, Asset, and Vulnerability Evaluation)

**Best for:** Organizational risk management
**Strengths:** Asset-focused, considers operational impact
**Weaknesses:** Heavy process, less technical detail

### Attack Trees

**Best for:** Specific attack scenario analysis
**Strengths:** Visual, easy to understand attack paths
**Weaknesses:** Limited scope, doesn't cover all threat types

## STRIDE Methodology Deep Dive

![STRIDE categories and the security property each violates](/assets/img/stride.svg)

### The Six Categories with Edge Cases

#### 1. Spoofing (Identity)

**Definition:** Pretending to be someone/something else

**Clear Examples:**

- Using stolen credentials to login
- IP address spoofing
- Email spoofing
- Certificate spoofing

**Edge Cases:**

- Session hijacking (could be spoofing or tampering)
- Man-in-the-middle attacks (involves both spoofing and tampering)

#### 2. Tampering (Integrity)

**Definition:** Modifying data or code without authorization

**Clear Examples:**

- Modifying database records
- Altering configuration files
- Code injection attacks
- Packet modification in transit

**Edge Cases:**

- Parameter manipulation (could be tampering or elevation of privilege)
- Race conditions leading to data corruption

#### 3. Repudiation (Non-repudiation)

**Definition:** Denying that an action was performed

**Clear Examples:**

- User denying they made a transaction
- Admin denying they deleted files
- Lack of audit logs

**Edge Cases:**

- Shared accounts (makes repudiation easier)
- Clock synchronization issues

#### 4. Information Disclosure (Confidentiality)

**Definition:** Exposing information to unauthorized parties

**Clear Examples:**

- SQL injection revealing data
- Directory traversal attacks
- Unencrypted data transmission
- Error messages revealing system info

**Edge Cases:**

- Timing attacks (information through response times)
- Side-channel attacks

#### 5. Denial of Service (Availability)

**Definition:** Making resources unavailable

**Clear Examples:**

- DDoS attacks
- Resource exhaustion
- System crashes
- Network flooding

**Edge Cases:**

- Algorithmic complexity attacks
- Storage exhaustion through log flooding

#### 6. Elevation of Privilege (Authorization)

**Definition:** Gaining higher privileges than intended

**Clear Examples:**

- Buffer overflow leading to admin access
- SQL injection with admin queries
- Privilege escalation bugs
- Insecure direct object references

**Edge Cases:**

- Horizontal privilege escalation (accessing peer data)
- Time-of-check-time-of-use (TOCTTOU) attacks

## 10 Examples Clarifying STRIDE Differences

### 1. Login Page Attack

- **Spoofing:** Using stolen username/password
- **Tampering:** Modifying login request to change user role parameter
- **Elevation of Privilege:** Exploiting a bug that grants admin access after login

### 2. Database Attack

- **Spoofing:** Connecting with fake service account credentials
- **Tampering:** SQL injection modifying user records
- **Information Disclosure:** SQL injection extracting sensitive data
- **Elevation of Privilege:** Using SQL injection to execute admin functions

### 3. API Attack

- **Spoofing:** Using forged JWT tokens
- **Tampering:** Modifying API request parameters
- **Information Disclosure:** Accessing API endpoints without authorization
- **Elevation of Privilege:** Exploiting IDOR to access admin functions

### 4. File System Attack

- **Spoofing:** Impersonating a legitimate process
- **Tampering:** Modifying configuration files
- **Information Disclosure:** Reading sensitive files via path traversal
- **Elevation of Privilege:** Exploiting file permissions to gain root access

### 5. Network Attack

- **Spoofing:** ARP spoofing to intercept traffic
- **Tampering:** Modifying packets in transit
- **Information Disclosure:** Packet sniffing on unencrypted channels
- **Denial of Service:** Network flooding

### 6. Session Management

- **Spoofing:** Session hijacking with stolen session ID
- **Tampering:** Modifying session data
- **Information Disclosure:** Session ID exposure in URLs
- **Elevation of Privilege:** Session fixation leading to admin access

### 7. Email System

- **Spoofing:** Sending emails with forged sender addresses
- **Tampering:** Modifying email content in transit
- **Information Disclosure:** Reading others' emails
- **Repudiation:** Denying sending malicious emails

### 8. Web Application

- **Spoofing:** CSRF attacks impersonating user actions
- **Tampering:** XSS modifying page content
- **Information Disclosure:** XSS stealing cookies/tokens
- **Elevation of Privilege:** XSS leading to admin panel access

### 9. Mobile Application

- **Spoofing:** App impersonation through repackaging
- **Tampering:** Runtime manipulation of app behavior
- **Information Disclosure:** Insecure data storage
- **Elevation of Privilege:** Rooting/jailbreaking exploitation

### 10. Cloud Infrastructure

- **Spoofing:** Using compromised cloud credentials
- **Tampering:** Modifying cloud configurations
- **Information Disclosure:** Misconfigured S3 buckets
- **Elevation of Privilege:** IAM privilege escalation

## A Common Point of Confusion

**Scenario:** Tampering with login request parameters (like user role)

**Analysis:**

- **Primary Category:** Tampering (you're modifying the request)
- **Secondary Effect:** Elevation of Privilege (the result is higher access)
- **Not Spoofing:** You're not impersonating someone else's identity

> **Rule of Thumb:** Categorize by the **attack method**, not the **outcome**. The
> outcome helps you understand impact, but STRIDE categorizes the attack vector.

## Alternative Threat Modeling Approaches

Once you're comfortable with STRIDE, these approaches complement it well:

### 1. PASTA (Recommended Addition)

- More business-risk focused
- Seven-stage process
- Better for executive communication
- Complements STRIDE's technical focus

### 2. LINDDUN (For Privacy)

- Privacy-focused threat modeling
- Complements STRIDE for GDPR/privacy requirements
- Seven categories: Linkability, Identifiability, Non-repudiation, Detectability, Disclosure, Unawareness, Non-compliance

### 3. CVSS + STRIDE

- Use CVSS scoring with STRIDE categories
- Better quantitative risk assessment
- Industry-standard scoring

## Threat vs. Risk

A statement I hear often: *"A threat is a possible harm/attack to the application,
where risk is the overall damage due to that harm or attack."* That's **partially
correct**, but it's worth being precise, because the distinction drives how you
prioritize.

![Risk equals Threat times Vulnerability times Impact](/assets/img/risk-equation.svg)

**More Precise Definitions:**

- **Threat:** A potential danger or adverse event that could exploit a vulnerability
- **Vulnerability:** A weakness that can be exploited
- **Risk:** The potential for loss/damage when a threat exploits a vulnerability
- **Impact:** The actual damage/consequence if the risk materializes

**Formula:** `Risk = Threat × Vulnerability × Impact`

**Better Statement:** *"A threat is a potential attack or adverse event that could
exploit system vulnerabilities. Risk is the likelihood of a threat successfully
exploiting a vulnerability multiplied by the potential impact/damage."*

**Worked Example:**

- **Threat:** SQL injection attack
- **Vulnerability:** Unsanitized input fields
- **Risk:** High likelihood of data breach with significant financial/reputational damage
- **Impact:** Loss of customer data, regulatory fines, reputation damage

This framework is what lets you move from *identifying* threats (STRIDE) to
*quantifying and prioritizing* risks for business decision-making — which is where
threat modeling stops being an academic exercise and starts protecting the product.
